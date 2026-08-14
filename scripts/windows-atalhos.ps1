<#
  Atalhos de sistema/janelas do Windows, abrir apps/sites, listar e focar
  janelas abertas, e listar/abrir jogos da Steam — chamado pelo servidor
  Node via powershell.exe (WSL2 interop ou nativo).

  Combos com a tecla Windows usam P/Invoke direto (keybd_event) porque o
  SendKeys do PowerShell não consegue enviar a tecla Windows. Bloquear e
  mostrar área de trabalho usam chamadas nativas em vez de simular o
  atalho — mais confiável que depender da tecla Windows sintética.

  Uso:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows-atalhos.ps1 -Acao <acao> [-Valor <...>] [-Extra <...>]

  Ações de tecla/sistema:
    print | bloquear | area_trabalho | snap_esquerda | snap_direita |
    clipboard | mover_monitor_esquerda | mover_monitor_direita
  Ações com parâmetro:
    abrir_url    -Valor <url> [-Extra <caminho do navegador>]
    abrir_app    -Valor <caminho/comando/atalho .lnk>
    abrir_uwp    -Valor <AppUserModelID>   (apps da Store/MSIX, ex.: Claude)
    abrir_jogo   -Valor <appid da Steam>
    focar_janela -Valor <handle da janela>
  Ações de listagem (devolvem JSON array):
    listar_janelas | listar_jogos

  Sempre imprime JSON no stdout.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,

    [string]$Valor,

    [string]$Extra
)

$ErrorActionPreference = 'Stop'

# Sem isto, o PowerShell escreve no stdout usando a codepage do console
# (CP850/CP1252 no Windows em português). Títulos de janela com emoji ou
# acento viram bytes inválidos — inclusive caracteres de CONTROLE crus
# dentro do JSON, que o JSON.parse do Node rejeita. Forçar UTF-8 aqui
# mantém o JSON válido de ponta a ponta.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Janelas {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool LockWorkStation();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    // Trazer uma janela para frente a partir de um processo em segundo plano
    // esbarra no "foreground lock" do Windows: SetForegroundWindow sozinho
    // costuma só piscar o botão na barra de tarefas. Simular um toque na
    // tecla ALT em volta da chamada libera esse bloqueio.
    public static void TrazerParaFrente(IntPtr hWnd) {
        if (IsIconic(hWnd)) { ShowWindow(hWnd, 9); }  // SW_RESTORE
        keybd_event(0x12, 0, 0, UIntPtr.Zero);        // ALT down
        SetForegroundWindow(hWnd);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);        // ALT up
    }
}
"@

# Códigos de tecla virtual usados nos combos
$VK_LWIN  = 0x5B
$VK_SHIFT = 0x10
$VK_LEFT  = 0x25
$VK_RIGHT = 0x27
$VK_S     = 0x53
$VK_V     = 0x56

function Enviar-Combo([byte[]]$teclas) {
    # KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2. Pressiona na ordem,
    # solta na ordem inversa (mesma lógica de um atalho físico).
    foreach ($t in $teclas) { [Janelas]::keybd_event($t, 0, 0x1, [UIntPtr]::Zero) }
    for ($i = $teclas.Length - 1; $i -ge 0; $i--) {
        [Janelas]::keybd_event($teclas[$i], 0, (0x1 -bor 0x2), [UIntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 50
}

function Obter-Janelas {
    # MainWindowTitle já filtra para processos com janela real de verdade —
    # bem mais simples e confiável que enumerar tudo com EnumWindows.
    Get-Process |
        Where-Object { $_.MainWindowTitle -and $_.MainWindowHandle -ne 0 } |
        Sort-Object MainWindowTitle |
        ForEach-Object {
            # Remove caracteres de controle que sobrem de emojis/símbolos em
            # títulos de janela — eles quebrariam o JSON no lado do Node.
            $titulo = ($_.MainWindowTitle -replace '[\x00-\x1F\x7F]', '').Trim()
            if (-not $titulo) { $titulo = $_.ProcessName }
            [PSCustomObject]@{
                id    = [string]$_.MainWindowHandle
                nome  = $titulo
                app   = $_.ProcessName
            }
        }
}

function Obter-JogosSteam {
    $raizSteam = Join-Path ${env:ProgramFiles(x86)} 'Steam'
    $bibliotecas = @($raizSteam)

    $vdf = Join-Path $raizSteam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
        $conteudo = Get-Content $vdf -Raw
        foreach ($m in [regex]::Matches($conteudo, '"path"\s+"(.+?)"')) {
            $bibliotecas += ($m.Groups[1].Value -replace '\\\\', '\')
        }
    }

    $jogos = @()
    foreach ($lib in ($bibliotecas | Select-Object -Unique)) {
        $pasta = Join-Path $lib 'steamapps'
        if (-not (Test-Path $pasta)) { continue }
        Get-ChildItem -Path $pasta -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue | ForEach-Object {
            $c = Get-Content $_.FullName -Raw
            $id = if ($c -match '"appid"\s+"(\d+)"') { $Matches[1] } else { $null }
            $nome = if ($c -match '"name"\s+"(.+?)"') { $Matches[1] } else { $null }
            # 228980 = Steamworks Common Redistributables, não é jogo.
            if ($id -and $nome -and $id -ne '228980') {
                $jogos += [PSCustomObject]@{ id = $id; nome = $nome }
            }
        }
    }
    $jogos | Sort-Object nome
}

switch ($Acao) {
    'print'                  { Enviar-Combo @($VK_LWIN, $VK_SHIFT, $VK_S) }
    'bloquear'                { [Janelas]::LockWorkStation() | Out-Null }
    'area_trabalho'          { (New-Object -ComObject Shell.Application).ToggleDesktop() }
    'snap_esquerda'          { Enviar-Combo @($VK_LWIN, $VK_LEFT) }
    'snap_direita'           { Enviar-Combo @($VK_LWIN, $VK_RIGHT) }
    'clipboard'                { Enviar-Combo @($VK_LWIN, $VK_V) }
    'mover_monitor_esquerda' { Enviar-Combo @($VK_LWIN, $VK_SHIFT, $VK_LEFT) }
    'mover_monitor_direita'  { Enviar-Combo @($VK_LWIN, $VK_SHIFT, $VK_RIGHT) }

    'abrir_url' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (URL) é obrigatório para abrir_url' }
        if ([string]::IsNullOrEmpty($Extra)) {
            Start-Process $Valor
        } else {
            # -Extra = navegador específico (ex.: Vivaldi, Zen)
            Start-Process -FilePath $Extra -ArgumentList $Valor
        }
    }
    'abrir_app' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (caminho ou comando) é obrigatório para abrir_app' }
        Start-Process $Valor
    }
    'abrir_uwp' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (AppUserModelID) é obrigatório para abrir_uwp' }
        # Apps empacotados (Store/MSIX) não têm .exe chamável direto —
        # abrem pelo shell namespace usando o AppUserModelID.
        Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\$Valor"
    }
    'abrir_jogo' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (appid) é obrigatório para abrir_jogo' }
        Start-Process "steam://rungameid/$Valor"
    }
    'focar_janela' {
        if ([string]::IsNullOrEmpty($Valor)) { throw 'Parametro -Valor (handle) é obrigatório para focar_janela' }
        [Janelas]::TrazerParaFrente([IntPtr][int64]$Valor)
    }

    'listar_janelas' {
        # @() garante array JSON mesmo com 0 ou 1 item.
        @(Obter-Janelas) | ConvertTo-Json -Compress -Depth 3
        exit 0
    }
    'listar_jogos' {
        @(Obter-JogosSteam) | ConvertTo-Json -Compress -Depth 3
        exit 0
    }

    default { throw "Ação desconhecida: $Acao" }
}

'{"ok":true}'
