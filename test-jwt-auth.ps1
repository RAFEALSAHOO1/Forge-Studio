# Test JWT Authentication Implementation
# This script tests the new JWT-based authentication system

$BaseUrl = "http://localhost:3000"
$TestEmail = "jwt-test-$(Get-Random -Minimum 1000 -Maximum 9999)@example.com"
$TestPassword = "SecurePass123!@#"
$TestName = "JWT Test User"

Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║          JWT Authentication System Test                    ║"
Write-Host "╚════════════════════════════════════════════════════════════╝`n"

# Test 1: Signup and verify JWT cookie
Write-Host "TEST 1: Signup - Verify JWT token is set in HTTP-only cookie"
Write-Host "───────────────────────────────────────────────────────────────"

$signupBody = @{
    action = "signup"
    name = $TestName
    email = $TestEmail
    password = $TestPassword
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/auth" `
        -Method POST `
        -Body $signupBody `
        -ContentType "application/json" `
        -SessionVariable session `
        -ErrorAction SilentlyContinue

    Write-Host "✅ Signup successful - Status: $($response.StatusCode)"
    
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "   User ID: $($responseData.data.user.id)"
    Write-Host "   User Email: $($responseData.data.user.email)"
    Write-Host "   User Role: $($responseData.data.user.role)"
    
    # Check for auth-token cookie
    $cookies = $session.Cookies.GetCookies([uri]$BaseUrl)
    $authCookie = $cookies | Where-Object { $_.Name -eq "auth-token" }
    
    if ($authCookie) {
        Write-Host "`n✅ HTTP-only Cookie Found"
        Write-Host "   Name: $($authCookie.Name)"
        Write-Host "   HttpOnly: $($authCookie.HttpOnly)"
        Write-Host "   Path: $($authCookie.Path)"
        Write-Host "   Token (first 50 chars): $($authCookie.Value.Substring(0, [Math]::Min(50, $authCookie.Value.Length)))..."
    } else {
        Write-Host "`n❌ No auth-token cookie found!"
    }
    
    $userId = $responseData.data.user.id
} catch {
    Write-Host "❌ Signup failed: $_"
    exit 1
}

# Test 2: Verify session with JWT token
Write-Host "`n`nTEST 2: Verify Session - Extract user from JWT cookie"
Write-Host "───────────────────────────────────────────────────────────────"

try {
    # Use the session variable which includes cookies
    $verifyResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth" `
        -Method GET `
        -WebSession $session `
        -ErrorAction SilentlyContinue

    Write-Host "✅ Session verified - Status: $($verifyResponse.StatusCode)"
    
    $verifyData = $verifyResponse.Content | ConvertFrom-Json
    Write-Host "   Verified User ID: $($verifyData.data.user.id)"
    Write-Host "   Verified Email: $($verifyData.data.user.email)"
    Write-Host "   Verified Role: $($verifyData.data.user.role)"
} catch {
    Write-Host "❌ Session verification failed: $_"
}

# Test 3: Test login endpoint
Write-Host "`n`nTEST 3: Login - Verify JWT is regenerated on login"
Write-Host "───────────────────────────────────────────────────────────────"

$loginBody = @{
    action = "login"
    email = $TestEmail
    password = $TestPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -SessionVariable loginSession `
        -ErrorAction SilentlyContinue

    Write-Host "✅ Login successful - Status: $($loginResponse.StatusCode)"
    
    $loginData = $loginResponse.Content | ConvertFrom-Json
    Write-Host "   User ID: $($loginData.data.user.id)"
    Write-Host "   User Email: $($loginData.data.user.email)"
    
    $cookies = $loginSession.Cookies.GetCookies([uri]$BaseUrl)
    $authCookie = $cookies | Where-Object { $_.Name -eq "auth-token" }
    
    if ($authCookie) {
        Write-Host "`n✅ New JWT Token Set in Cookie"
        Write-Host "   Token (first 50 chars): $($authCookie.Value.Substring(0, [Math]::Min(50, $authCookie.Value.Length)))..."
    }
} catch {
    Write-Host "❌ Login failed: $_"
}

# Test 4: Logout and clear cookie
Write-Host "`n`nTEST 4: Logout - Verify JWT cookie is cleared"
Write-Host "───────────────────────────────────────────────────────────────"

try {
    $logoutResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth" `
        -Method DELETE `
        -WebSession $session `
        -ErrorAction SilentlyContinue

    Write-Host "✅ Logout successful - Status: $($logoutResponse.StatusCode)"
    
    # Verify cookie is cleared
    $cookies = $session.Cookies.GetCookies([uri]$BaseUrl)
    $authCookie = $cookies | Where-Object { $_.Name -eq "auth-token" }
    
    if (-not $authCookie) {
        Write-Host "✅ JWT Cookie successfully cleared"
    } else {
        Write-Host "⚠️  Cookie still present (may be expired): $($authCookie.Value.Substring(0, 30))..."
    }
} catch {
    Write-Host "❌ Logout failed: $_"
}

# Test 5: Verify session fails after logout
Write-Host "`n`nTEST 5: Session Verification After Logout"
Write-Host "───────────────────────────────────────────────────────────────"

try {
    $postLogoutVerify = Invoke-WebRequest -Uri "$BaseUrl/api/auth" `
        -Method GET `
        -WebSession $session `
        -ErrorAction SilentlyContinue

    Write-Host "⚠️  Got status $($postLogoutVerify.StatusCode) - Expected 401"
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ Correctly returned 401 Unauthorized after logout"
        Write-Host "   Error: $($_.Exception.Response.StatusDescription)"
    } else {
        Write-Host "❌ Unexpected error: $_"
    }
}

Write-Host "`n╔════════════════════════════════════════════════════════════╗"
Write-Host "║                    Tests Complete                           ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
