#!/usr/bin/env python3
"""
All-in-one startup script for Innovation Leaderboard
Handles setup and backend server in one script
"""

import os
import sys
import subprocess
import time
import threading
import webbrowser
from pathlib import Path

# Configuration
BACKEND_PORT = 4444
PROJECT_ROOT = Path(__file__).parent.parent

def print_message(message):
    print(message)

def check_python():
    """Check if Python is available"""
    try:
        version = sys.version_info
        if version.major >= 3 and version.minor >= 7:
            print_message(f"Python {version.major}.{version.minor} detected")
            return True
        else:
            print_message(f"Python 3.7+ required, found {version.major}.{version.minor}")
            return False
    except Exception as e:
        print_message(f"Python check failed: {e}")
        return False

def setup_environment():
    """Setup virtual environment and install dependencies"""
    print_message("\nSetting up environment...")
    
    venv_path = PROJECT_ROOT / "venv"
    
    # Create virtual environment if it doesn't exist
    if not venv_path.exists():
        print_message("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)
    
    # Determine pip path
    if os.name == 'nt':  # Windows
        pip_path = venv_path / "Scripts" / "pip.exe"
        python_path = venv_path / "Scripts" / "python.exe"
    else:  # Unix/Linux/Mac
        pip_path = venv_path / "bin" / "pip"
        python_path = venv_path / "bin" / "python"
    
    # Install requirements
    requirements_path = PROJECT_ROOT / "requirements.txt"
    if requirements_path.exists():
        print_message("Installing dependencies...")
        subprocess.run([str(pip_path), "install", "-r", str(requirements_path)], check=True)
    
    print_message("Environment setup complete")
    return python_path

def start_backend(python_path):
    """Start the Flask backend server"""
    print_message("\nStarting Backend Server...")
    
    app_path = PROJECT_ROOT / "app.py"
    if not app_path.exists():
        print_message("app.py not found!")
        return None
    
    # Change to project directory
    os.chdir(PROJECT_ROOT)
    
    # Start backend in a separate process
    backend_process = subprocess.Popen(
        [str(python_path), "app.py"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True
    )
    
    # Wait a moment for backend to start
    time.sleep(3)
    
    # Check if backend is running
    if backend_process.poll() is None:
        print_message(f"Backend running on http://localhost:{BACKEND_PORT}")
        return backend_process
    else:
        stdout, stderr = backend_process.communicate()
        print_message(f"Backend failed to start:")
        print_message(f"STDOUT: {stdout}")
        print_message(f"STDERR: {stderr}")
        return None

def test_backend():
    """Test if backend is responding"""
    try:
        import requests
        response = requests.get(f"http://localhost:{BACKEND_PORT}/health", timeout=5)
        if response.status_code == 200:
            print_message("Backend health check passed")
            return True
    except Exception:
        pass
    
    print_message("Backend health check failed")
    return False

def main():
    """Main startup function"""
    print_message("=" * 60)
    print_message("Innovation Leaderboard - Startup")
    print_message("=" * 60)
    
    # Check Python version
    if not check_python():
        input("Press Enter to exit...")
        return
    
    try:
        # Setup environment
        python_path = setup_environment()
        
        # Start backend
        backend_process = start_backend(python_path)
        if not backend_process:
            input("Press Enter to exit...")
            return
        
        # Test backend
        if not test_backend():
            print_message("Backend may not be fully ready, but continuing...")
        
        # Print status
        print_message("\n" + "=" * 60)
        print_message("APPLICATION READY!")
        print_message("=" * 60)
        print_message(f"Backend: http://localhost:{BACKEND_PORT}")
        print_message("Default SDM: nachi / password123")
        print_message("\nBrowser will open automatically...")
        print_message("Press Ctrl+C to stop server")
        print_message("=" * 60)
        
        # Open browser
        def open_browser():
            time.sleep(2)
            webbrowser.open(f'http://localhost:{BACKEND_PORT}')
        
        threading.Thread(target=open_browser, daemon=True).start()
        
        # Wait for server to run
        try:
            backend_process.wait()
        except KeyboardInterrupt:
            pass
        
    except KeyboardInterrupt:
        print_message("\n\nShutting down server...")
        if 'backend_process' in locals() and backend_process:
            backend_process.terminate()
            backend_process.wait()
        print_message("Server stopped")
    except Exception as e:
        print_message(f"\nError: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()
