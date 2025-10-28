# Innovation Leaderboard

A streamlined Innovation Leaderboard application built from scratch with Flask backend and Vanilla JavaScript frontend, preserving the beautiful dark theme UI design. Now featuring AI-powered similarity analysis for better idea management.

## Quick Start

### Prerequisites
- Python 3.7 or higher
- pip (Python package installer)

### Dependencies
- **Flask** (2.3.3) - Web framework
- **Flask-CORS** (4.0.0) - Cross-origin resource sharing
- **bcrypt** (4.0.1) - Password hashing
- **PyJWT** (2.8.0) - JSON Web Tokens
- **scikit-learn** - Machine learning for AI features
- **requests** - HTTP client for avatar APIs

### Startup

Run the application with:

```bash
python scripts/run.py
```

This command will:
- Setup virtual environment (if needed)
- Install dependencies (Flask, scikit-learn, requests, etc.)
- Start backend server on port 5000
- Open browser automatically
- Show status messages

### Access
- **Full Application**: http://localhost:5000 (auto-opens)
- **Default SDM**: username: `nachi`, password: `password123`

## Project Structure

```
leaderboard-app/
├── app.py             # Flask backend (all-in-one)
├── index.html         # Frontend HTML
├── styles.css         # Dark theme CSS
├── script.js          # JavaScript functionality
├── requirements.txt   # Python dependencies
├── scripts/           # Essential utilities
│   ├── run.py         # Startup script
│   └── test.py        # Backend testing
└── database/          # SQLite database (auto-created)
```

## Features

- **Authentication**: JWT-based login/register
- **Role-Based Access**: Service Engineers & SDMs (Service Delivery Managers) can register themselves
- **Idea Management**: Submit, review, approve/reject with reasons
- **AI Similarity Check**: NLP-powered duplicate detection
- **Scoring System**: Automatic points calculation
- **Leaderboard**: Real-time rankings with statistics
- **Dynamic Avatars**: Professional avatars for all users (DiceBear API)
- **Personal Welcome**: "Welcome [Name]!" with circular avatars
- **Custom Branding**: Unique logo and favicon from assets

## AI-Powered Features

### Similarity Analysis
- **Technology**: scikit-learn with TF-IDF vectorization and cosine similarity
- **Purpose**: Prevents duplicate submissions and helps SDMs identify related ideas
- **How it works**: Analyzes title and description against all existing ideas
- **Access**: SDM dashboard → Click "Similarity Check" on any pending idea

## UI Design

The application preserves the original beautiful dark theme design:
- **Dark Theme**: Professional color palette (#121212 background)
- **Accent Colors**: Cyan (#00D1FF), Magenta (#FF2E88), Lime (#C3FF00)
- **Dynamic Avatars**: Professional avatars generated via DiceBear API
- **Personal Welcome**: Customized headers with user avatars
- **Responsive Design**: CSS Grid and Flexbox
- **Smooth Animations**: Hover effects and transitions
- **Toast Notifications**: User-friendly feedback
- **Modal Dialogs**: Clean forms and interactions
- **Consistent Buttons**: Uniform sizing with color-coded actions

## Default Credentials

- **Pre-configured SDM**: `nachi` / `password123` (Service Delivery Manager)
- **Register new accounts**: Choose either Service Engineer or SDM role

## Scoring System

- **Base Points**: Innovation (5), Automation (10), Security (10)
- **Implementation Bonus**: Innovation (+10), Automation (+15), Security (+15)
- **Benefit Multipliers**: Marginal (+5), Moderate (+10), High (+15), Very High (+20), Gamechanger (+30)

## Technology Stack

- **Backend**: Python + Flask (single file)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Database**: SQLite (auto-created)
- **Authentication**: JWT tokens
- **AI/ML**: scikit-learn for text similarity analysis
- **Avatars**: DiceBear API for dynamic user avatars
- **HTTP Client**: requests for API integrations
- **Styling**: Custom CSS with dark theme

## Benefits

- **Simple**: Single-file backend, no complex setup
- **Smart**: AI-powered duplicate detection
- **Beautiful**: Preserved original dark theme design
- **Lightweight**: Minimal dependencies
- **Easy to Modify**: Clean, readable code
- **Responsive**: Works on all screen sizes

## Troubleshooting

### Common Issues

1. **Dashboard fails to load**
   - Make sure backend server is running on port 5000
   - Check browser console for errors
   - Try logging out and logging back in
   - Hard refresh (Ctrl+F5) to clear cache

2. **Similarity Check not working**
   - Ensure scikit-learn is installed (run `run_app.bat` again)
   - Check browser console for API errors
   - Verify you're logged in as SDM

3. **CORS errors**
   - The app now allows all origins for development
   - If issues persist, restart the servers

4. **Authentication issues**
   - Clear browser localStorage: F12 → Application → Local Storage → Clear
   - Use default credentials: `nachi` / `password123`

5. **Test the backend**
   ```bash
   python scripts/test.py
   ```

6. **Avatar issues**
   - Avatars are generated via DiceBear API
   - If avatars show as initials, the API call failed and local fallback is used
   - Check internet connectivity for DiceBear API
   - Existing users keep their generated avatars

### Alternative Options

```bash
# Test backend only
python scripts/test.py

# Startup (same as above)
python scripts/run.py

# Manual Flask run
python app.py
```

---

Clean. Simple. Beautiful. AI-Powered.
