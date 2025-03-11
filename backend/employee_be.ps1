# be_template.ps1 (Employee Backend)

# Set $username to be the name of the parent folder.
$username = Split-Path (Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent) -Leaf

$sharedFolder = "$HOME/Documents/ServerData/ServerData2/data"
$dataFile = Join-Path -Path $sharedFolder -ChildPath "${username}_data.json"
Write-Host $($dataFile)
if (!(Test-Path -Path $sharedFolder)) {
    New-Item -ItemType Directory -Path $sharedFolder | Out-Null
}
if (!(Test-Path -Path $dataFile)) {
    @() | ConvertTo-Json -Depth 2 | Set-Content -Path $dataFile -Encoding UTF8
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running on http://localhost:8080"

while ($true) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/username") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentType = "text/plain"
            $response.StatusCode = 200
            $response.OutputStream.Write([System.Text.Encoding]::UTF8.GetBytes($username), 0, [System.Text.Encoding]::UTF8.GetBytes($username).Length)
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "GET") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            try {
                $jsonData = Get-Content -Path $dataFile -Raw
                if (-not $jsonData) {
                    $jsonData = "[]"
                }
                $response.ContentType = "application/json"
                $response.StatusCode = 200
                $response.OutputStream.Write(
                    [System.Text.Encoding]::UTF8.GetBytes($jsonData),
                    0,
                    [System.Text.Encoding]::UTF8.GetBytes($jsonData).Length
                )
            } catch {
                Write-Host "Error in GET handler: $($_.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
                $errorMessage = "{`"error`": `"$($_.Exception.Message)`"}"
                $response.OutputStream.Write(
                    [System.Text.Encoding]::UTF8.GetBytes($errorMessage),
                    0,
                    [System.Text.Encoding]::UTF8.GetBytes($errorMessage).Length
                )
            } finally {
                $response.Close()
            }
        }
        elseif ($request.HttpMethod -eq "POST") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            try {
                $reader = New-Object IO.StreamReader($request.InputStream)
                $data = $reader.ReadToEnd() | ConvertFrom-Json
                $reader.Close()

                if (-not $data.type -in @("in", "out")) {
                    throw "Invalid data format: 'type' is required."
                }

                $existingData = Get-Content -Path $dataFile | ConvertFrom-Json
                if (-not ($existingData -is [System.Collections.IEnumerable])) {
                    $existingData = @($existingData)
                }

                $lastEntry = ($existingData | Where-Object { $_.name -eq $username }) | Select-Object -Last 1

                # Get the current time rounded to the minute.
                $now = Get-Date
                $nowRounded = Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour $now.Hour -Minute $now.Minute -Second 0

                if ($data.type -eq "in") {
                    if ($lastEntry -and -not $lastEntry.punchOut) {
                        throw "You must punch out before punching in again"
                    }
                    # Add a new entry with status set to "pending"
                    $existingData += @{
                        name     = $username
                        date     = $nowRounded.ToString("yyyy-MM-dd")
                        punchIn  = $nowRounded.ToString("HH:mm:ss")
                        punchOut = $null
                        overtime = $null
                        status   = "pending"
                    }
                } elseif ($data.type -eq "out") {
                    if (-not $lastEntry -or $lastEntry.punchOut) {
                        throw "No active punch-in record found"
                    }
                    
                    $lastEntry.punchOut = $nowRounded.ToString("HH:mm:ss")
                    $punchInTime = [DateTime]::ParseExact("$($lastEntry.date) $($lastEntry.punchIn)", "yyyy-MM-dd HH:mm:ss", $null)
                    $punchOutTime = [DateTime]::ParseExact("$($lastEntry.date) $($lastEntry.punchOut)", "yyyy-MM-dd HH:mm:ss", $null)
                    $lastEntry.overtime = ($punchOutTime - $punchInTime).ToString("hh\:mm\:ss")
                    # Leave the status as "pending" until reviewed by a manager.
                }

                $existingData | ConvertTo-Json -Depth 3 | Set-Content -Path $dataFile -Encoding UTF8

                $response.ContentType = "application/json"
                $response.StatusCode = 200

                $responseMessage = @{
                    message = "Data updated successfully."
                }
                if ($data.type -eq "in" -or $data.type -eq "out") {
                    $responseMessage["time"] = $nowRounded.ToString("HH:mm:ss")
                }
                $responseString = $responseMessage | ConvertTo-Json -Depth 3
                $response.OutputStream.Write(
                    [System.Text.Encoding]::UTF8.GetBytes($responseString),
                    0,
                    [System.Text.Encoding]::UTF8.GetBytes($responseString).Length
                )

            } catch {
                Write-Host "Error in POST handler: $($_.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
                $response.OutputStream.Write(
                    [System.Text.Encoding]::UTF8.GetBytes("$($_.Exception.Message)"),
                    0,
                    [System.Text.Encoding]::UTF8.GetBytes("$($_.Exception.Message)").Length
                )
            } finally {
                $response.Close()
            }
        }
        else {
            $response.StatusCode = 405
            $response.OutputStream.Write([System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed"))
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        $response.StatusCode = 500
        $response.OutputStream.Write(
            [System.Text.Encoding]::UTF8.GetBytes("$($_.Exception.Message)"),
            0,
            [System.Text.Encoding]::UTF8.GetBytes("$($_.Exception.Message)").Length
        )
    } finally {
        $response.Close()
    }
}