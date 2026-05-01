# check_blocks.ps1
$jp = Get-Content 'c:\Mioshie_Sites\guia_johrei\Markdown\MD_Original_normalized\浄霊法講座1.md' -Encoding UTF8
$pt = Get-Content 'c:\Mioshie_Sites\guia_johrei\Markdown\MD_PT_v3\Johrei_Ho_Kohza_1_retranslated.md' -Encoding UTF8

function Split-Blocks($lines) {
    $blocks = [System.Collections.Generic.List[string]]::new()
    $current = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        if ($line.Trim() -eq '') {
            if ($current.Count -gt 0) {
                $blocks.Add(($current -join ' '))
                $current.Clear()
            }
        } else {
            $current.Add($line.Trim())
        }
    }
    if ($current.Count -gt 0) { $blocks.Add(($current -join ' ')) }
    return $blocks
}

$jpBlocks = Split-Blocks $jp
$ptBlocks = Split-Blocks $pt
Write-Host "JP blocos: $($jpBlocks.Count)"
Write-Host "PT blocos: $($ptBlocks.Count)"

$max = [Math]::Min(8, $jpBlocks.Count)
for ($i = 0; $i -lt $max; $i++) {
    Write-Host "--- Bloco $($i+1) ---"
    $jpLen = [Math]::Min(100, $jpBlocks[$i].Length)
    $ptLen = [Math]::Min(100, $ptBlocks[$i].Length)
    Write-Host "JP: $($jpBlocks[$i].Substring(0, $jpLen))..."
    Write-Host "PT: $($ptBlocks[$i].Substring(0, $ptLen))..."
    Write-Host ""
}
