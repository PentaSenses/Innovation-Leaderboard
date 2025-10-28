#!/usr/bin/env python3
"""Quick backend test script"""

import requests

def test_backend():
    print("Testing Backend...")
    
    tests = [
        ("Health Check", "GET", "http://localhost:5000/health", None),
        ("Leaderboard", "GET", "http://localhost:5000/api/leaderboard/", None),
        ("Login", "POST", "http://localhost:5000/api/auth/login", 
         {"username": "nachi", "password": "password123"})
    ]
    
    results = []
    for name, method, url, data in tests:
        try:
            response = requests.request(method, url, json=data, timeout=5)
            if response.status_code == 200:
                print(f"PASS: {name}")
                results.append(True)
                if name == "Login":
                    token = response.json().get('token', '')
                    print(f"   Token: {token[:20]}...")
            else:
                print(f"FAIL: {name} ({response.status_code})")
                results.append(False)
        except Exception as e:
            print(f"FAIL: {name} - {str(e)[:50]}...")
            results.append(False)
    
    success_rate = sum(results) / len(results) * 100
    print(f"\nBackend: {success_rate:.0f}% working")
    return success_rate == 100

if __name__ == "__main__":
    test_backend()
