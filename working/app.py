from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import bcrypt
import jwt
import uuid
from datetime import datetime, timedelta
from functools import wraps
import os
import random
import base64
import requests
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-super-secret-jwt-key-change-this-in-production'

# Enable CORS
CORS(app, origins='*')

# Database configuration
DB_PATH = './database/leaderboard.db'

def generate_avatar(display_name=""):
    """Generate a professional avatar using DiceBear API"""
    if not display_name or display_name.strip() == "":
        display_name = "User"

    try:
        import requests
        import urllib.parse

        encoded_name = urllib.parse.quote(display_name.strip())

        # Use DiceBear 'thumbs' style for illustrated avatars instead of initials
        avatar_url = (
            "https://api.dicebear.com/7.x/thumbs/svg?seed="
            f"{encoded_name}&mood=happy&backgroundColor=ff6b6b,4ecdc4,45b7d1,96ceb4"
        )

        response = requests.get(avatar_url, timeout=15)

        if response.status_code == 200:
            svg_content = response.text

            if "<svg" in svg_content and "</svg>" in svg_content:
                import base64

                encoded_svg = base64.b64encode(svg_content.encode()).decode()
                return f"data:image/svg+xml;base64,{encoded_svg}"

        # Fall back if the API returns a bad status or invalid SVG
        return generate_fallback_avatar(display_name)

    except Exception:
        return generate_fallback_avatar(display_name)

def generate_fallback_avatar(display_name=""):
    """Fallback avatar generation if API fails"""
    colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#EE5A24', '#0ABDE3', '#10AC84', '#F368E0', '#222F3E'
    ]

    # Select random color
    bg_color = random.choice(colors)

    # Get initials from display name
    if display_name:
        parts = display_name.strip().split()
        initials = ''.join(word[0].upper() for word in parts[:2])
    else:
        initials = "?"

    # Create SVG avatar with circle background and initials
    avatar_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="{bg_color}"/>
  <text x="50" y="67" font-family="Arial, sans-serif" font-size="{30 if len(initials) == 1 else 24}"
        font-weight="bold" text-anchor="middle" fill="white">{initials}</text>
</svg>'''

    return f"data:image/svg+xml;base64,{base64.b64encode(avatar_svg.encode()).decode()}"

def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    """Initialize database with tables"""
    # Create database directory if it doesn't exist
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = get_db_connection()
    
    # Create users table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('Service Engineer', 'SDM')),
            avatar_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create ideas table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            engineer_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL CHECK (category IN ('Innovation', 'Automation', 'Security')),
            service_area TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            assigned_sdm_id TEXT NOT NULL,
            implemented INTEGER DEFAULT 0,
            benefit_level TEXT NOT NULL,
            points INTEGER DEFAULT 0,
            security_gap TEXT,
            possible_solution TEXT,
            automation_opportunity TEXT,
            automation_solution TEXT,
            innovative_idea TEXT,
            rejection_reason TEXT,
            submission_date DATE DEFAULT CURRENT_DATE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (engineer_id) REFERENCES users (id),
            FOREIGN KEY (assigned_sdm_id) REFERENCES users (id)
        )
    ''')
    
    # Insert default SDMs
    default_password = 'password123'
    hashed_password = bcrypt.hashpw(default_password.encode('utf-8'), bcrypt.gensalt())
    
    default_sdms = [
        {
            'id': str(uuid.uuid4()),
            'username': 'nachi',
            'display_name': 'Nachi',
            'email': 'nachi@company.com',
            'role': 'SDM'
        },
        {
            'id': str(uuid.uuid4()),
            'username': 'admin',
            'display_name': 'Admin',
            'email': 'admin@company.com',
            'role': 'SDM'
        }
    ]
    
    for sdm in default_sdms:
        # Special avatar for Nachi
        if sdm['display_name'] == 'Nachi':
            # Create a custom avatar for Nachi
            nachi_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#00D1FF"/>
  <circle cx="35" cy="40" r="8" fill="#FFFFFF"/>
  <circle cx="65" cy="40" r="8" fill="#FFFFFF"/>
  <circle cx="35" cy="40" r="4" fill="#000000"/>
  <circle cx="65" cy="40" r="4" fill="#000000"/>
  <path d="M 30 65 Q 50 75 70 65" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>
  <text x="50" y="85" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="white">N</text>
</svg>'''
            avatar = f"data:image/svg+xml;base64,{base64.b64encode(nachi_svg.encode()).decode()}"
        else:
            avatar = generate_avatar(sdm['display_name'])
        
        try:
            conn.execute('''
                INSERT OR IGNORE INTO users (id, username, display_name, email, password_hash, role, avatar_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (sdm['id'], sdm['username'], sdm['display_name'], sdm['email'], 
                  hashed_password.decode('utf-8'), sdm['role'], avatar))
        except sqlite3.IntegrityError:
            pass  # User already exists
    
    # Check if title column exists, if not add it
    try:
        conn.execute("SELECT title FROM ideas LIMIT 1")
    except sqlite3.OperationalError:
        # Title column doesn't exist, add it
        try:
            conn.execute("ALTER TABLE ideas ADD COLUMN title TEXT DEFAULT 'Untitled Idea'")
            print("Added title column to ideas table")
        except sqlite3.OperationalError as e:
            print(f"Failed to add title column: {e}")
    
    conn.commit()
    conn.close()
    print("Database initialized successfully")

# Authentication decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            if token.startswith('Bearer '):
                token = token[7:]
            
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            
            conn = get_db_connection()
            user = conn.execute(
                'SELECT * FROM users WHERE id = ?', (data['id'],)
            ).fetchone()
            conn.close()
            
            if not user:
                return jsonify({'error': 'Invalid token'}), 401
                
            request.current_user = {
                'id': user['id'],
                'username': user['username'],
                'display_name': user['display_name'],
                'email': user['email'],
                'role': user['role'],
                'avatar_data': user['avatar_data']
            }
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
            
        return f(*args, **kwargs)
    return decorated

def require_role(required_role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.current_user['role'] != required_role:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'OK',
        'timestamp': datetime.now().isoformat()
    })

# Authentication endpoints
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['username', 'display_name', 'email', 'password', 'role']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        username = data['username'].strip()
        display_name = data['display_name'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        role = data['role']
        
        # Validate role
        if role not in ['Service Engineer', 'SDM']:
            return jsonify({'error': 'Invalid role selected'}), 400
        
        # Basic validation
        if len(username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters long'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters long'}), 400
        
        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        # Create user with avatar
        user_id = str(uuid.uuid4())
        avatar = generate_avatar(display_name)
        conn = get_db_connection()
        
        try:
            conn.execute('''
                INSERT INTO users (id, username, display_name, email, password_hash, role, avatar_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, username, display_name, email, password_hash.decode('utf-8'), role, avatar))
            
            conn.commit()
            
            # Generate JWT token
            token = jwt.encode({
                'id': user_id,
                'username': username,
                'role': role,
                'exp': datetime.utcnow() + timedelta(days=7)
            }, app.config['SECRET_KEY'], algorithm='HS256')
            
            return jsonify({
                'message': 'User registered successfully',
                'token': token,
                'user': {
                    'id': user_id,
                    'username': username,
                    'display_name': display_name,
                    'email': email,
                    'role': role,
                    'avatar_data': avatar
                }
            }), 201
            
        except sqlite3.IntegrityError as e:
            if 'username' in str(e):
                return jsonify({'error': 'Username already exists'}), 409
            elif 'email' in str(e):
                return jsonify({'error': 'Email already exists'}), 409
            else:
                return jsonify({'error': 'User already exists'}), 409
        finally:
            conn.close()
            
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Username and password are required'}), 400
        
        username = data['username'].strip()
        password = data['password']
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE username = ?', (username,)
        ).fetchone()
        conn.close()
        
        if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Generate JWT token
        token = jwt.encode({
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'exp': datetime.utcnow() + timedelta(days=7)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'display_name': user['display_name'],
                'email': user['email'],
                'role': user['role'],
                'avatar_data': user['avatar_data']
            }
        })
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/profile', methods=['GET'])
@token_required
def get_profile():
    return jsonify({'user': request.current_user})

# Ideas endpoints
@app.route('/api/ideas/submit', methods=['POST'])
@token_required
@require_role('Service Engineer')
def submit_idea():
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['title', 'category', 'service_area', 'benefit_level', 'assigned_sdm_id']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Build description from category-specific content
        description = ''
        category = data['category']
        if category == 'Security':
            security_gap = data.get('security_gap', '').strip()
            possible_solution = data.get('possible_solution', '').strip()
            if security_gap:
                description += f"Security Gap: {security_gap}"
            if possible_solution:
                if description:
                    description += ' | '
                description += f"Possible Solution: {possible_solution}"
        elif category == 'Automation':
            automation_opportunity = data.get('automation_opportunity', '').strip()
            automation_solution = data.get('automation_solution', '').strip()
            if automation_opportunity:
                description += f"Automation Opportunity: {automation_opportunity}"
            if automation_solution:
                if description:
                    description += ' | '
                description += f"Automation Solution: {automation_solution}"
        elif category == 'Innovation':
            innovative_idea = data.get('innovative_idea', '').strip()
            description = innovative_idea
        
        idea_id = str(uuid.uuid4())
        
        conn = get_db_connection()
        
        # Insert idea with description
        conn.execute('''
            INSERT INTO ideas (
                id, engineer_id, title, description, category, service_area, assigned_sdm_id,
                implemented, benefit_level, security_gap, possible_solution,
                automation_opportunity, automation_solution, innovative_idea
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            idea_id, request.current_user['id'], data['title'], description, data['category'], data['service_area'],
            data['assigned_sdm_id'], data.get('implemented', False), data['benefit_level'],
            data.get('security_gap', ''), data.get('possible_solution', ''),
            data.get('automation_opportunity', ''), data.get('automation_solution', ''),
            data.get('innovative_idea', '')
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Idea submitted successfully',
            'idea': {
                'id': idea_id,
                'category': data['category'],
                'service_area': data['service_area'],
                'status': 'pending'
            }
        }), 201
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/my-ideas', methods=['GET'])
@token_required
@require_role('Service Engineer')
def get_my_ideas():
    try:
        conn = get_db_connection()
        ideas = conn.execute('''
            SELECT 
                i.*, u.display_name as assigned_sdm_name
            FROM ideas i
            LEFT JOIN users u ON i.assigned_sdm_id = u.id
            WHERE i.engineer_id = ?
            ORDER BY i.submission_date DESC
        ''', (request.current_user['id'],)).fetchall()
        
        conn.close()
        
        ideas_list = []
        for idea in ideas:
            ideas_list.append(dict(idea))
        
        return jsonify({'ideas': ideas_list})
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/worklist', methods=['GET'])
@token_required
@require_role('SDM')
def get_worklist():
    try:
        conn = get_db_connection()
        ideas = conn.execute('''
            SELECT 
                i.*, u.display_name as engineer_name, u.username as engineer_username
            FROM ideas i
            JOIN users u ON i.engineer_id = u.id
            WHERE i.assigned_sdm_id = ? AND i.status = 'pending'
            ORDER BY i.submission_date ASC
        ''', (request.current_user['id'],)).fetchall()
        
        conn.close()
        
        ideas_list = []
        for idea in ideas:
            ideas_list.append(dict(idea))
        
        return jsonify({'ideas': ideas_list})
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/<idea_id>/approve', methods=['POST'])
@token_required
@require_role('SDM')
def approve_idea(idea_id):
    try:
        conn = get_db_connection()
        
        # Get idea details
        idea = conn.execute('''
            SELECT * FROM ideas 
            WHERE id = ? AND assigned_sdm_id = ? AND status = 'pending'
        ''', (idea_id, request.current_user['id'])).fetchone()
        
        if not idea:
            return jsonify({'error': 'Idea not found'}), 404
        
        # Calculate points
        base_points = {'Automation': 10, 'Security': 10, 'Innovation': 5}
        impl_points = {'Automation': 15, 'Security': 15, 'Innovation': 10}
        benefit_multipliers = {
            'Marginal': 5, 'Moderate': 10, 'High': 15, 
            'Very High': 20, 'Gamechanger': 30
        }
        
        points = base_points.get(idea['category'], 0)
        if idea['implemented']:
            points += impl_points.get(idea['category'], 0) + benefit_multipliers.get(idea['benefit_level'], 0)
        
        # Update idea
        conn.execute('''
            UPDATE ideas 
            SET status = 'approved', points = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (points, idea_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Idea approved successfully',
            'points_awarded': points
        })
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/<idea_id>/reject', methods=['POST'])
@token_required
@require_role('SDM')
def reject_idea(idea_id):
    try:
        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '').strip()
        
        if not rejection_reason:
            return jsonify({'error': 'Rejection reason is required'}), 400
        
        conn = get_db_connection()
        
        # Get idea details
        idea = conn.execute('''
            SELECT * FROM ideas 
            WHERE id = ? AND assigned_sdm_id = ? AND status = 'pending'
        ''', (idea_id, request.current_user['id'])).fetchone()
        
        if not idea:
            conn.close()
            return jsonify({'error': 'Idea not found'}), 404
        
        # Update idea
        conn.execute('''
            UPDATE ideas 
            SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (rejection_reason, idea_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Idea rejected successfully'
        })
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/<idea_id>', methods=['GET'])
@token_required
def get_idea(idea_id):
    try:
        conn = get_db_connection()
        idea = conn.execute('''
            SELECT 
                i.*, 
                u.display_name as engineer_name, u.username as engineer_username,
                s.display_name as assigned_sdm_name
            FROM ideas i
            LEFT JOIN users u ON i.engineer_id = u.id
            LEFT JOIN users s ON i.assigned_sdm_id = s.id
            WHERE i.id = ?
        ''', (idea_id,)).fetchone()
        
        conn.close()
        
        if not idea:
            return jsonify({'error': 'Idea not found'}), 404
        
        return jsonify({'idea': dict(idea)})
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/<idea_id>/similarity', methods=['GET'])
@token_required
@require_role('SDM')
def check_similarity(idea_id):
    try:
        conn = get_db_connection()
        
        # Get the target idea
        target_idea = conn.execute('SELECT * FROM ideas WHERE id = ?', (idea_id,)).fetchone()
        if not target_idea:
            conn.close()
            return jsonify({'error': 'Idea not found'}), 404
        
        # Get all other ideas (pending or approved)
        other_ideas = conn.execute('''
            SELECT id, title, description, category, status
            FROM ideas 
            WHERE id != ? AND (status = 'pending' OR status = 'approved')
        ''', (idea_id,)).fetchall()
        
        conn.close()
        
        if not other_ideas:
            return jsonify({'similar_ideas': []})
        
        # Prepare texts for similarity
        target_text = f"{target_idea['title'] or ''} {target_idea['description'] or ''}".strip()
        other_texts = [f"{idea['title'] or ''} {idea['description'] or ''}".strip() for idea in other_ideas]
        
        if not target_text:
            return jsonify({'similar_ideas': []})
        
        # Combine for vectorization
        all_texts = [target_text] + other_texts
        
        # Simple preprocessing
        def preprocess(text):
            text = text.lower()
            text = re.sub(r'[^\w\s]', '', text)
            return text
        
        all_texts = [preprocess(text) for text in all_texts]
        
        # TF-IDF vectorization
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform(all_texts)
        
        # Cosine similarity
        similarity_scores = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
        
        # Get top 5 similar ideas
        similar_indices = similarity_scores.argsort()[::-1][:5]
        
        similar_ideas = []
        for idx in similar_indices:
            if similarity_scores[idx] > 0.1:  # Threshold
                idea = dict(other_ideas[idx])
                idea['similarity_score'] = round(float(similarity_scores[idx]) * 100, 2)
                similar_ideas.append(idea)
        
        return jsonify({'similar_ideas': similar_ideas})
        
    except Exception as e:
        print(f"Similarity check error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/ideas/approved/all', methods=['GET'])
@token_required
@require_role('SDM')
def get_approved_ideas():
    try:
        conn = get_db_connection()
        # First check if title column exists, if not add it
        try:
            conn.execute("SELECT title FROM ideas LIMIT 1")
        except:
            # Title column doesn't exist, add it
            conn.execute("ALTER TABLE ideas ADD COLUMN title TEXT DEFAULT 'Untitled Idea'")
            conn.commit()
        
        ideas = conn.execute('''
            SELECT 
                i.id, 
                COALESCE(i.title, 'Untitled Idea') as title,
                i.description,
                i.category, 
                i.service_area, 
                i.benefit_level, 
                i.points, 
                i.submission_date,
                i.status, 
                i.implemented, 
                u.display_name as engineer_name
            FROM ideas i
            JOIN users u ON i.engineer_id = u.id
            WHERE i.status = 'approved'
            ORDER BY i.submission_date DESC
        ''').fetchall()
        
        conn.close()
        
        ideas_list = []
        for idea in ideas:
            ideas_list.append(dict(idea))
        
        return jsonify({'ideas': ideas_list})
        
    except Exception as e:
        print(f"Error in get_approved_ideas: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

# Leaderboard endpoints
@app.route('/api/leaderboard/', methods=['GET'])
def get_leaderboard():
    try:
        conn = get_db_connection()
        
        # Get leaderboard
        leaderboard = conn.execute('''
            SELECT 
                u.display_name, u.username,
                SUM(i.points) as total_points,
                COUNT(i.id) as total_ideas
            FROM users u
            JOIN ideas i ON u.id = i.engineer_id
            WHERE i.status = 'approved' AND i.points > 0
            GROUP BY u.id, u.display_name, u.username
            ORDER BY total_points DESC
            LIMIT 50
        ''').fetchall()
        
        # Get recent activities
        recent_activities = conn.execute('''
            SELECT 
                i.category, i.submission_date, i.points,
                u.display_name as engineer_name
            FROM ideas i
            JOIN users u ON i.engineer_id = u.id
            WHERE i.status = 'approved' AND i.points > 0
            ORDER BY i.updated_at DESC
            LIMIT 10
        ''').fetchall()
        
        conn.close()
        
        return jsonify({
            'leaderboard': [dict(row) for row in leaderboard],
            'recent_activities': [dict(row) for row in recent_activities]
        })
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

# Users endpoints
@app.route('/api/users/sdms', methods=['GET'])
@token_required
def get_sdms():
    try:
        conn = get_db_connection()
        sdms = conn.execute('''
            SELECT id, username, display_name, email
            FROM users
            WHERE role = 'SDM'
            ORDER BY display_name
        ''').fetchall()
        
        conn.close()
        
        return jsonify({'sdms': [dict(row) for row in sdms]})
        
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

# Serve frontend files
@app.route('/')
def serve_frontend():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    init_database()
    app.run(host='0.0.0.0', port=4444, debug=True)
