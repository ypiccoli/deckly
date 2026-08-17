<#
  Controla volume e teclas de mídia do Windows sem depender de utilitários
  externos (ex.: nircmd) — usa P/Invoke direto na API do Windows.

  Uso:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows-media.ps1 -Acao <acao> [-Valor <0-100>]

  Ações: playpause | anterior | proxima | mute | volume_subir | volume_descer
         definir_volume | status | listar_saidas | definir_saida

  Imprime no stdout um JSON com o estado atual:
    {"volume":NN,"mudo":true|false,"saida":"Nome do dispositivo"}

  A exceção é listar_saidas, que devolve um array:
    [{"id":"{0.0.0...}","nome":"Fones de ouvido","padrao":true}, ...]

  Nota técnica: toda a manipulação do volume master (IAudioEndpointVolume) é
  feita DENTRO do bloco C# abaixo, em métodos estáticos simples (float/bool).
  Interfaces COM que só suportam IUnknown (sem IDispatch) não podem ter seus
  métodos chamados diretamente a partir do PowerShell em cima de um
  System.__ComObject — o PowerShell não enxerga o vtable da interface
  customizada. Por isso o PowerShell só chama métodos estáticos do C#, nunca
  a interface COM diretamente.

  Nota de performance: compilar o bloco C# via Add-Type (csc.exe por baixo)
  custa ~1-2s — inaceitável rodando a cada clique no tablet. Por isso a
  primeira execução compila para um .dll em disco (cache ao lado deste
  script) e as execuções seguintes só carregam esse .dll pronto (quase
  instantâneo). Se o cache não puder ser gravado por algum motivo, cai de
  volta para compilar em memória a cada vez — mais lento, mas nunca quebra.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,

    [string]$Valor
)

$ErrorActionPreference = 'Stop'

# Nome de dispositivo de áudio tem acento ("Alto-falantes", "Fones de
# ouvido") e às vezes símbolo. Sem isto o PowerShell escreve na codepage do
# console (CP850/CP1252 em português) e o JSON chega ao Node com bytes
# inválidos.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$CodigoFonte = @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int NotImpl1();
    int NotImpl2();
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

// A ORDEM dos métodos é a vtable COM: um método a mais ou a menos aqui
// desloca todos os seguintes e faz chamar o método errado. Por isso os
// métodos que não usamos continuam declarados como NotImplN.
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    int OpenPropertyStore(uint stgmAccess, out IPropertyStore ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState(out uint pdwState);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceCollection {
    int GetCount(out uint pcDevices);
    int Item(uint nDevice, out IMMDevice ppDevice);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, uint dwStateMask, out IMMDeviceCollection ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
}

[StructLayout(LayoutKind.Sequential)]
public struct PropertyKey {
    public Guid fmtid;
    public int pid;
}

// PROPVARIANT tem 16 bytes em x86 e 24 em x64; só precisamos do
// discriminador (vt) e do ponteiro da string, que fica no offset 8.
[StructLayout(LayoutKind.Explicit)]
public struct PropVariant {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr pointerValue;
}

[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
    int GetCount(out uint cProps);
    int GetAt(uint iProp, out PropertyKey pkey);
    int GetValue(ref PropertyKey key, out PropVariant pv);
    int SetValue(ref PropertyKey key, ref PropVariant propvar);
    int Commit();
}

// IPolicyConfig NÃO é documentada pela Microsoft — é a única forma de
// trocar o dispositivo de saída padrão sem instalar utilitário externo, e é
// o que nircmd e AudioDeviceCmdlets usam por baixo. Há duas variantes; a
// primeira vale do Windows 7 em diante, a segunda é a do Vista, mantida
// como reserva porque a posição de SetDefaultEndpoint na vtable muda entre
// elas (índice 10 aqui, 9 lá).
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPolicyConfig {
    int NotImpl0(); int NotImpl1(); int NotImpl2(); int NotImpl3();
    int NotImpl4(); int NotImpl5(); int NotImpl6(); int NotImpl7();
    int NotImpl8(); int NotImpl9();
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, int eRole);
}

[Guid("568b9108-44bf-40b4-9006-86afe5b5a620"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPolicyConfigVista {
    int NotImpl0(); int NotImpl1(); int NotImpl2(); int NotImpl3();
    int NotImpl4(); int NotImpl5(); int NotImpl6(); int NotImpl7();
    int NotImpl8();
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, int eRole);
}

[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
public class PolicyConfigClientComObject { }

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public static class AudioController {
    private static IAudioEndpointVolume ObterInterface() {
        var enumerador = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dispositivo = null;
        Marshal.ThrowExceptionForHR(enumerador.GetDefaultAudioEndpoint(0, 1, out dispositivo));
        var iid = typeof(IAudioEndpointVolume).GUID;
        object epv = null;
        Marshal.ThrowExceptionForHR(dispositivo.Activate(ref iid, 23, IntPtr.Zero, out epv));
        return (IAudioEndpointVolume)epv;
    }

    public static float ObterVolume() {
        float nivel;
        ObterInterface().GetMasterVolumeLevelScalar(out nivel);
        return nivel;
    }

    public static void DefinirVolume(float nivel) {
        ObterInterface().SetMasterVolumeLevelScalar(nivel, Guid.Empty);
    }

    public static bool ObterMudo() {
        bool mudo;
        ObterInterface().GetMute(out mudo);
        return mudo;
    }

    public static void DefinirMudo(bool mudo) {
        ObterInterface().SetMute(mudo, Guid.Empty);
    }

    public static void PassoVolumeCima() {
        ObterInterface().VolumeStepUp(Guid.Empty);
    }

    public static void PassoVolumeBaixo() {
        ObterInterface().VolumeStepDown(Guid.Empty);
    }
}

// Saídas de áudio: listar e trocar a padrão. Como no AudioController, tudo
// que toca COM fica aqui dentro e o PowerShell só vê tipos primitivos.
public static class SaidasDeAudio {
    private const int RENDER = 0;              // eRender: dispositivos de saída
    private const uint ESTADO_ATIVO = 1;       // DEVICE_STATE_ACTIVE
    private const uint LEITURA = 0;            // STGM_READ
    private const int VT_LPWSTR = 31;

    private static PropertyKey ChaveNomeAmigavel() {
        // PKEY_Device_FriendlyName — o nome que aparece no painel de som.
        var chave = new PropertyKey();
        chave.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");
        chave.pid = 14;
        return chave;
    }

    private static string NomeDe(IMMDevice dispositivo) {
        IPropertyStore propriedades = null;
        if (dispositivo.OpenPropertyStore(LEITURA, out propriedades) != 0 || propriedades == null) {
            return "(sem nome)";
        }
        var chave = ChaveNomeAmigavel();
        PropVariant valor;
        if (propriedades.GetValue(ref chave, out valor) != 0) return "(sem nome)";
        if (valor.vt != VT_LPWSTR || valor.pointerValue == IntPtr.Zero) return "(sem nome)";
        return Marshal.PtrToStringUni(valor.pointerValue);
    }

    private static string IdPadrao(IMMDeviceEnumerator enumerador) {
        IMMDevice padrao = null;
        // Sem dispositivo nenhum (todas as saídas desligadas) isto falha em
        // vez de devolver null — e aí não há padrão a marcar.
        if (enumerador.GetDefaultAudioEndpoint(RENDER, 0, out padrao) != 0 || padrao == null) {
            return null;
        }
        string id;
        if (padrao.GetId(out id) != 0) return null;
        return id;
    }

    // Separador de unidade (U+001F), escrito como código para continuar
    // visível no fonte: nome de dispositivo pode conter praticamente
    // qualquer caractere imprimível, inclusive "|" e ";".
    private static readonly string SEP = ((char)31).ToString();

    // Devolve uma linha por dispositivo: id, nome e se é o padrão — quem
    // monta o JSON é o PowerShell.
    public static string[] Listar() {
        var enumerador = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDeviceCollection colecao = null;
        Marshal.ThrowExceptionForHR(enumerador.EnumAudioEndpoints(RENDER, ESTADO_ATIVO, out colecao));

        uint total;
        Marshal.ThrowExceptionForHR(colecao.GetCount(out total));

        string idPadrao = IdPadrao(enumerador);
        var linhas = new System.Collections.Generic.List<string>();
        for (uint i = 0; i < total; i++) {
            IMMDevice dispositivo = null;
            if (colecao.Item(i, out dispositivo) != 0 || dispositivo == null) continue;
            string id;
            if (dispositivo.GetId(out id) != 0) continue;
            bool ehPadrao = (idPadrao != null && id == idPadrao);
            linhas.Add(id + SEP + NomeDe(dispositivo) + SEP + (ehPadrao ? "1" : "0"));
        }
        return linhas.ToArray();
    }

    public static string NomeDoPadrao() {
        var enumerador = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice padrao = null;
        if (enumerador.GetDefaultAudioEndpoint(RENDER, 0, out padrao) != 0 || padrao == null) {
            return null;
        }
        return NomeDe(padrao);
    }

    public static void Definir(string idDispositivo) {
        var cliente = new PolicyConfigClientComObject();

        // Os três papéis juntos: o Windows guarda "padrão" (console),
        // "multimídia" e "comunicação" separadamente, e trocar só o primeiro
        // deixa a chamada de voz tocando no dispositivo antigo — que é
        // exatamente o caso de uso de quem alterna entre fone e caixa.
        var moderna = cliente as IPolicyConfig;
        if (moderna != null) {
            for (int papel = 0; papel <= 2; papel++) {
                Marshal.ThrowExceptionForHR(moderna.SetDefaultEndpoint(idDispositivo, papel));
            }
            return;
        }

        var antiga = cliente as IPolicyConfigVista;
        if (antiga != null) {
            for (int papel = 0; papel <= 2; papel++) {
                Marshal.ThrowExceptionForHR(antiga.SetDefaultEndpoint(idDispositivo, papel));
            }
            return;
        }

        throw new Exception("Este Windows não expõe IPolicyConfig — não dá para trocar a saída de áudio.");
    }
}

public static class TeclasDeMidia {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

# O cache fica dentro de scripts/ (sistema de arquivos do WSL), o que para o
# Windows é um caminho de rede (\\wsl.localhost\...). O .NET bloqueia
# Add-Type -Path / Assembly.LoadFrom em caminhos de rede (FileLoadException,
# HRESULT 0x80131515 "carregamento a partir de origem remota bloqueado").
# Solução: ler os bytes manualmente e carregar com Assembly.Load(byte[]),
# que não carrega informação de zona/origem e não sofre esse bloqueio.
#
# O nome do cache leva um hash do próprio código C#: mexer neste script gera
# outro nome, então o .dll velho nunca é carregado no lugar do novo. Sem
# isso, quem já tivesse rodado a versão anterior continuaria com as classes
# antigas — e o sintoma seria "método não encontrado" numa função que está
# claramente escrita aqui.
$sha = [System.Security.Cryptography.SHA1]::Create()
$hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($CodigoFonte))).Replace('-', '').Substring(0, 8)
$CaminhoDllCache = Join-Path $PSScriptRoot "windows-media-nativo-$hash.dll"

# Limpa versões anteriores do cache, para não acumular um .dll por edição.
Get-ChildItem -Path $PSScriptRoot -Filter 'windows-media-nativo*.dll' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "windows-media-nativo-$hash.dll" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $CaminhoDllCache)) {
    try {
        Add-Type -TypeDefinition $CodigoFonte -OutputAssembly $CaminhoDllCache
    } catch {
        # Não conseguiu gravar o cache (ex.: sem permissão de escrita) — sem
        # problema, segue sem cache; só fica mais lento a cada chamada.
    }
}

try {
    $bytesMontagem = [System.IO.File]::ReadAllBytes($CaminhoDllCache)
    [System.Reflection.Assembly]::Load($bytesMontagem) | Out-Null
} catch {
    Add-Type -TypeDefinition $CodigoFonte
}

function Enviar-TeclaVirtual([byte]$codigo) {
    # KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2
    [TeclasDeMidia]::keybd_event($codigo, 0, 0x1, [UIntPtr]::Zero)
    [TeclasDeMidia]::keybd_event($codigo, 0, 0x1 -bor 0x2, [UIntPtr]::Zero)
}

switch ($Acao) {
    'playpause'      { Enviar-TeclaVirtual 0xB3 }       # VK_MEDIA_PLAY_PAUSE
    'anterior'       { Enviar-TeclaVirtual 0xB1 }       # VK_MEDIA_PREV_TRACK
    'proxima'        { Enviar-TeclaVirtual 0xB0 }       # VK_MEDIA_NEXT_TRACK
    'mute'           { [AudioController]::DefinirMudo(-not [AudioController]::ObterMudo()) }
    'volume_subir'   { [AudioController]::PassoVolumeCima() }
    'volume_descer'  { [AudioController]::PassoVolumeBaixo() }
    'definir_volume' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor é obrigatório para definir_volume' }
        $nivel = [float]$Valor / 100.0
        if ($nivel -lt 0) { $nivel = 0 }
        if ($nivel -gt 1) { $nivel = 1 }
        [AudioController]::DefinirVolume($nivel)
    }
    'listar_saidas' {
        # Única ação que não devolve o estado de volume: é uma listagem,
        # como as de windows-atalhos.ps1.
        $saidas = @([SaidasDeAudio]::Listar() | ForEach-Object {
            $partes = $_ -split ([char]31)
            [PSCustomObject]@{
                id     = $partes[0]
                nome   = $partes[1]
                padrao = ($partes[2] -eq '1')
            }
        })
        # ConvertTo-Json de um array de 1 item devolve objeto, não array —
        # -AsArray não existe no PowerShell 5.1, então força-se pela raiz.
        ConvertTo-Json -InputObject $saidas -Compress -Depth 3
        return
    }
    'definir_saida' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (id do dispositivo) é obrigatório para definir_saida' }
        [SaidasDeAudio]::Definir($Valor)
    }
    'status' { }
    default { throw "Ação desconhecida: $Acao" }
}

[PSCustomObject]@{
    volume = [math]::Round([AudioController]::ObterVolume() * 100)
    mudo   = [bool][AudioController]::ObterMudo()
    saida  = [SaidasDeAudio]::NomeDoPadrao()
} | ConvertTo-Json -Compress
