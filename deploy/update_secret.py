import requests
import base64
from nacl import encoding, public
import sys

# Configuration
TOKEN = "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"
OWNER = "akash109saini"
REPO = "HR-management"
SECRET_NAME = "REACT_APP_BACKEND_URL"
SECRET_VALUE = "https://hr-backend-tuxv.onrender.com"

headers = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

def get_public_key():
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/public-key"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def encrypt(public_key: str, secret_value: str) -> str:
    public_key = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def update_secret(key_id, encrypted_value):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/{SECRET_NAME}"
    data = {
        "encrypted_value": encrypted_value,
        "key_id": key_id
    }
    response = requests.put(url, headers=headers, json=data)
    if response.status_code in [201, 204]:
        print("Successfully updated secret!")
    else:
        print(f"Failed to update secret: {response.status_code} - {response.text}")
        response.raise_for_status()

def main():
    try:
        pk_info = get_public_key()
        key_id = pk_info["key_id"]
        public_key = pk_info["key"]
        print(f"Retrieved public key {key_id}")
        
        encrypted_val = encrypt(public_key, SECRET_VALUE)
        print("Encrypted secret value.")
        
        update_secret(key_id, encrypted_val)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
