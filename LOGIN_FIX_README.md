# Login "Failed to Fetch" Issue - Root Cause & Fix

## Problem
Users see "Failed to fetch" error when attempting to login on the STMS application.

## Root Cause Analysis

### Current State
- ✅ **.NET Backend API** is running on `http://localhost:5000`
  - CORS is correctly configured to allow `http://localhost:4200` (Program.cs, lines 52-55)
  - Login endpoint exists at `/api/auth/login`

- ❌ **Angular Frontend** is NOT running
  - Should run on `http://localhost:4200` via Angular dev server
  - Currently NO Node.js process is running
  - Users cannot access the UI at all

### Why "Failed to Fetch" Occurs
The frontend `util.ts` function `errMsg()` shows:
```typescript
if (e?.status === 0) return 'Cannot reach the server. Is the API running?';
```

Status code 0 is returned when:
1. Network request completely fails (timeout, unreachable)
2. CORS policy blocks the request
3. Target server is not responding

In this case: **The Angular development server (frontend) is not running**, so there's no browser tab to make the request from.

---

## Solution

### Step 1: Start the .NET Backend (if not already running)
```powershell
cd "C:\Users\user\Desktop\STMS\StockApi\StockApi\StockApi"
dotnet run
# Output should show: http://localhost:5000
```

### Step 2: Start the Angular Frontend (in a NEW terminal)
```powershell
cd "C:\Users\user\Desktop\STMS\stms-web"
npm install  # Only needed if node_modules are missing
npm start    # runs 'ng serve'
# Output should show: http://localhost:4200
```

### Step 3: Access the Application
- Open browser: **http://localhost:4200/**
- Login with credentials:
  - Username: `admin`
  - Password: (from `appsettings.json` Seed:AdminPassword)
  - Default: `ChangeMe123!`

---

## Verification Checklist

✅ Confirm both servers are running:
```
Backend: http://localhost:5000/api/products  (should return JSON)
Frontend: http://localhost:4200/               (should show login form)
```

✅ Check browser console (F12 -> Console):
- Should see: `API_URL config: { hostname: 'localhost', localHost: true, API_URL: 'http://localhost:5000' }`
- No CORS errors

✅ Check Network tab (F12 -> Network):
- Login POST should go to: `http://localhost:5000/api/auth/login`
- Response status should be 200 on success (not 0)

---

## Configuration Files

### Frontend API Configuration (`stms-web/src/app/core/config.ts`)
```typescript
const localHost = typeof location !== 'undefined' &&
	(location.hostname === 'localhost' || location.hostname === '127.0.0.1');
export const API_URL = localHost ? 'http://localhost:5000' : '';
```

### Backend CORS Configuration (`StockApi/Program.cs`, lines 52-55)
```csharp
var corsOrigins = (cfg["Cors:Origins"] ?? "http://localhost:4200")
	.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddPolicy("web", p =>
	p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));
```

---

## Why Two Separate Servers?

During development:
- **Frontend** (.NET serves API requests only): `ng serve` on port 4200
- **Backend** (.NET API): `dotnet run` on port 5000
- Frontend makes AJAX calls to backend via CORS

In production:
- Both are hosted on the same origin (e.g., `https://example.com`)
- `/api` requests are reverse-proxied to the .NET backend
- Frontend is served as static files from the .NET `wwwroot` folder

---

## Troubleshooting

### Still seeing "Failed to fetch"?

1. **Check both servers are running**
   ```powershell
   # Terminal 1: Backend
   cd "C:\Users\user\Desktop\STMS\StockApi\StockApi\StockApi"
   dotnet run

   # Terminal 2: Frontend  
   cd "C:\Users\user\Desktop\STMS\stms-web"
   ng serve
   ```

2. **Verify ports**
   - Backend: `http://localhost:5000` (check Program.cs & launchSettings.json)
   - Frontend: `http://localhost:4200` (default for ng serve)

3. **Check Node.js is installed**
   ```powershell
   node --version  # Should show v22+
   npm --version   # Should show v11+
   ```

4. **Check .NET is running**
   ```powershell
   dotnet --version  # Should show 10.0.x
   ```

5. **Clear browser cache**
   - Press F12 -> Network tab -> Disable cache -> F5 refresh
   - Or: Ctrl+Shift+Delete and clear all

6. **Check browser console for detailed errors**
   - F12 -> Console tab
   - Look for CORS errors or DNS resolution failures

---

## Changes Made

### File: `stms-web/src/app/core/config.ts`
**Added diagnostic logging** to help identify configuration issues:
```typescript
console.log('API_URL config:', { hostname, localHost, API_URL });
```

This logs to browser console showing:
- Detected hostname
- Whether it's recognized as localhost
- The resolved API_URL

---

## Summary

| Component | Port | Status | Fix Required |
|-----------|------|--------|--------------|
| Backend (.NET API) | 5000 | ✅ Running | None |
| Frontend (Angular) | 4200 | ❌ Not started | **Run `ng serve` in stms-web folder** |
| CORS Config | - | ✅ Correct | None |
| API Endpoint | /api/auth/login | ✅ Implemented | None |

**Next Step:** Start the Angular frontend with `ng serve` in the stms-web folder.
