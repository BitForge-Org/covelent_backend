# Production Server Fix Guide

## Issue
The Docker container cannot find `covelnt.json` because the environment variable `FIREBASE_SERVICE_ACCOUNT_PATH` is pointing to a non-existent directory (`config/` or `configs/`) inside the container.

## Solution

1.  **SSH into your server**.
2.  **Navigate to your configs folder** (where `covelent.env` is located).
    ```bash
    cd configs
    ```
3.  **Update the Environment Variable**:
    Run this command to set the correct path:
    ```bash
    sed -i 's|^FIREBASE_SERVICE_ACCOUNT_PATH=.*|FIREBASE_SERVICE_ACCOUNT_PATH=./covelnt.json|' covelent.env
    ```
4.  **Restart the Container**:
    ```bash
    docker restart covelent-server
    ```

## Verification
Check logs to ensure the error is gone:
```bash
docker logs -f covelent-server
```
