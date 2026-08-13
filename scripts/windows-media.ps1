<#
  Controla volume e teclas de mídia do Windows sem depender de utilitários
  externos (ex.: nircmd) — usa P/Invoke direto na API do Windows.

  Uso:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows-media.ps1 -Acao <acao> [-Valor <0-100>]

  Ações: playpause | anterior | proxima | mute | volume_subir | volume_descer | definir_volume | status

  Sempre imprime no stdout um JSON com o estado atual: {"volume":NN,"mudo":true|false}

  Nota técnica: toda a manipulação do volume master (IAudioEndpointVolume) é
  feita DENTRO do bloco C# abaixo, em métodos estáticos simples (float/bool).
  Interfaces COM que só suportam IUnknown (sem IDispatch) não podem ter seus
  métodos chamados diretamente a partir do PowerShell em cima de um
  System.__ComObject — o PowerShell não enxerga o vtable da interface
  customizada. Por isso o PowerShell só chama métodos estáticos do C#, nunca
  a interface COM diretamente.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,

    [string]$Valor
)

$ErrorActionPreference = 'Stop'

Add-Type @"
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

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

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

public static class TeclasDeMidia {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

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
    'status' { }
    default { throw "Ação desconhecida: $Acao" }
}

[PSCustomObject]@{
    volume = [math]::Round([AudioController]::ObterVolume() * 100)
    mudo   = [bool][AudioController]::ObterMudo()
} | ConvertTo-Json -Compress
