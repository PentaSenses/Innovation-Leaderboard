// Global variables
let currentUser = null;
let authToken = null;
const API_BASE_URL = '/api';

// DOM elements
const pages = {
    home: document.getElementById('homePage'),
    dashboard: document.getElementById('dashboardPage')
};

function buildIdeaDescription(idea = {}) {
    if (!idea || typeof idea !== 'object') {
        return 'No description';
    }

    const candidates = [
        idea.description,
        idea.idea_description,
        idea.detailed_description,
        idea.full_description,
        idea.details,
        idea.summary
    ];

    for (const text of candidates) {
        if (typeof text === 'string' && text.trim()) {
            return text.trim();
        }
    }

    for (const [key, value] of Object.entries(idea)) {
        if (typeof value === 'string' && value.trim() && /description|summary|details/i.test(key)) {
            return value.trim();
        }
    }

    if (idea.category === 'Security') {
        const segments = [];
        if (idea.security_gap) segments.push(`Security Gap: ${idea.security_gap}`);
        if (idea.possible_solution) segments.push(`Possible Solution: ${idea.possible_solution}`);
        if (segments.length) return segments.join('\n\n');
    }

    if (idea.category === 'Automation') {
        const segments = [];
        if (idea.automation_opportunity) segments.push(`Automation Opportunity: ${idea.automation_opportunity}`);
        if (idea.automation_solution) segments.push(`Automation Solution: ${idea.automation_solution}`);
        if (segments.length) return segments.join('\n\n');
    }

    if (idea.category === 'Innovation' && idea.innovative_idea) {
        return idea.innovative_idea;
    }

    return 'No description';
}

async function enrichIdeaWithDetails(idea) {
    if (!idea || typeof idea !== 'object') return idea;
    if (!idea.id) return idea;
    
    // Always try to enrich approved ideas since they may not have description in list view
    if (idea.status !== 'approved' && (idea.description && idea.description.trim())) return idea;

    try {
        // Try different endpoints for approved ideas
        let endpoint = `${API_BASE_URL}/ideas/${idea.id}`;
        if (idea.status === 'approved') {
            // Try approved-specific endpoint first
            endpoint = `${API_BASE_URL}/ideas/${idea.id}`;
        }
        
        let response = await fetch(endpoint, {
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        });
        
        // If approved endpoint fails, try general endpoint
        if (!response.ok && idea.status === 'approved') {
            response = await fetch(`${API_BASE_URL}/ideas/${idea.id}`, {
                headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
            });
        }

        if (!response.ok) {
            return idea;
        }

        const data = await response.json();
        const detailedIdea = data.idea || data.data || data.result || data;
        return { ...idea, ...detailedIdea };
    } catch (error) {
        console.error('Failed to enrich idea details:', error);
        return idea;
    }
}

async function enrichIdeaList(ideas) {
    if (!Array.isArray(ideas)) return [];
    return Promise.all(ideas.map(enrichIdeaWithDetails));
}

const navLinks = document.querySelectorAll('.nav-menu a[data-page]');
const navUser = document.getElementById('navUser');
const authBtn = document.getElementById('authBtn');
const themeToggle = document.getElementById('themeToggle');
const dashboardLink = document.querySelector('[data-page="dashboard"]');
const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const azureSsoBtn = document.getElementById('azureSsoBtn');
const ssoConfigHint = document.getElementById('ssoConfigHint');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthStatus();
});

function initializeApp() {
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';

    // Check for SSO token in URL (after Azure redirect)
    try {
        const url = new URL(window.location.href);
        const ssoToken = url.searchParams.get('ssoToken');
        if (ssoToken) {
            authToken = ssoToken;
            localStorage.setItem('authToken', authToken);
            // Clean the URL so the token isn't left in the address bar
            url.searchParams.delete('ssoToken');
            window.history.replaceState({}, document.title, url.toString());
        }
    } catch (e) {
        console.error('Failed to parse SSO token from URL', e);
    }

    // Check for stored auth token
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');
    
    if (storedToken && storedUser) {
        authToken = storedToken;
        currentUser = JSON.parse(storedUser);
        updateAuthUI();
        showPage('home');
        loadHomePageData();
    } else {
        showPage('home');
        loadHomePageData();
    }

    // Initialize SSO configuration hint (optional)
    initializeSsoConfig();
}

function setupEventListeners() {
    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            showPage(page);
        });
    });

    // Mobile navigation toggle
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('show');
    });

    // Auth button
    authBtn.addEventListener('click', () => {
        showModal('authModal');
    });

    // Azure SSO button
    if (azureSsoBtn) {
        azureSsoBtn.addEventListener('click', () => {
            // Start SSO login – backend will redirect to Azure
            window.location.href = '/api/auth/sso/login';
        });
    }

    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Hero submit idea button
    document.getElementById('submitIdeaHeroBtn').addEventListener('click', () => {
        if (currentUser) {
            showIdeaSubmissionModal();
        } else {
            showModal('authModal');
        }
    });

    // Auth forms
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
    
    // Logout
    logoutBtn.addEventListener('click', handleLogout);

    // Dashboard buttons
    const submitIdeaBtn = document.getElementById('submitIdeaBtn');
    if (submitIdeaBtn) {
        submitIdeaBtn.addEventListener('click', () => {
            showIdeaSubmissionModal();
        });
    }

    // Modal events
    setupModalEvents();
    
    // Form events
    setupFormEvents();
}

async function initializeSsoConfig() {
    if (!ssoConfigHint) return;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/sso/settings`);
        if (!response.ok) {
            // Hide hint if SSO is not configured
            ssoConfigHint.style.display = 'none';
            return;
        }

        const data = await response.json();
        if (!data.enabled) {
            ssoConfigHint.style.display = 'none';
            return;
        }

        const platform = data.platform || 'Web';
        const redirectUri = data.redirect_uri || '';
        const requiresSecret = data.require_client_secret ? 'Yes' : 'No';

        ssoConfigHint.textContent = `SSO enabled via Azure OAuth SSO. Platform: ${platform}. Redirect URI: ${redirectUri}. Requires Client Secret: ${requiresSecret}.`;
        ssoConfigHint.style.display = 'block';
    } catch (error) {
        console.error('Failed to load SSO settings:', error);
        if (ssoConfigHint) {
            ssoConfigHint.style.display = 'none';
        }
    }
}

function setupModalEvents() {
    const ideaModal = document.getElementById('ideaSubmissionModal');
    const authModal = document.getElementById('authModal');
    
    // Auth modal events
    document.getElementById('closeAuthModal').addEventListener('click', () => {
        hideModal('authModal');
    });

    // Idea details modal events
    document.getElementById('closeIdeaDetailsModal').addEventListener('click', () => {
        hideModal('ideaDetailsModal');
    });

    // Approval modal events
    document.getElementById('closeApprovalModal').addEventListener('click', () => {
        hideModal('approvalModal');
    });
    document.getElementById('cancelApproval').addEventListener('click', () => {
        hideModal('approvalModal');
    });
    document.getElementById('confirmApproval').addEventListener('click', confirmApproval);

    // Rejection modal events
    document.getElementById('closeRejectionModal').addEventListener('click', () => {
        hideModal('rejectionModal');
    });
    document.getElementById('cancelRejection').addEventListener('click', () => {
        hideModal('rejectionModal');
    });
    document.getElementById('confirmRejection').addEventListener('click', confirmRejection);

    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchAuthTab(tabName);
        });
    });

    // Close modal events
    document.getElementById('closeIdeaModal').addEventListener('click', () => {
        hideModal('ideaSubmissionModal');
    });

    // SDM Action button events (using event delegation)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-approve')) {
            const button = e.target.closest('.btn-approve');
            const ideaId = button.getAttribute('data-idea-id');
            const ideaTitle = button.getAttribute('data-idea-title');
            approveIdea(ideaId, ideaTitle);
        } else if (e.target.closest('.btn-reject')) {
            const button = e.target.closest('.btn-reject');
            const ideaId = button.getAttribute('data-idea-id');
            const ideaTitle = button.getAttribute('data-idea-title');
            rejectIdea(ideaId, ideaTitle);
        } else if (e.target.closest('.btn-similarity')) {
            const button = e.target.closest('.btn-similarity');
            const ideaId = button.getAttribute('data-idea-id');
            const ideaTitle = button.getAttribute('data-idea-title');
            checkSimilarity(ideaId, ideaTitle);
        }
    });

    const cancelIdeaBtn = document.getElementById('cancelIdeaBtn');
    if (cancelIdeaBtn) {
        cancelIdeaBtn.addEventListener('click', () => {
            const form = document.getElementById('ideaSubmissionForm');
            if (form) {
                form.reset();
                // Reset category fields visibility
                document.getElementById('securityFields').style.display = 'none';
                document.getElementById('automationFields').style.display = 'none';
                document.getElementById('innovationFields').style.display = 'none';
                // Reset benefit value display
                const benefitValue = document.getElementById('benefitValue');
                if (benefitValue) benefitValue.textContent = 'High';
            }
            hideModal('ideaSubmissionModal');
        });
    }

    // Click outside to close
    if (ideaModal) {
        ideaModal.addEventListener('click', (e) => {
            if (e.target === ideaModal) {
                ideaModal.classList.remove('show');
            }
        });
    }

    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.classList.remove('show');
        }
    });

    // Idea submission form
    const ideaForm = document.getElementById('ideaSubmissionForm');
    if (ideaForm) {
        ideaForm.addEventListener('submit', handleIdeaSubmission);
    }

    // Similarity modal events
    document.getElementById('closeSimilarityModal').addEventListener('click', () => {
        hideModal('similarityModal');
    });
    document.getElementById('closeSimilarityBtn').addEventListener('click', () => {
        hideModal('similarityModal');
    });
}

function setupFormEvents() {
    // Category change event for idea form
    document.getElementById('ideaCategory').addEventListener('change', (e) => {
        const category = e.target.value;
        showCategoryFields(category);
    });

    // Benefit slider event
    const benefitSlider = document.getElementById('benefitLevel');
    const benefitValue = document.getElementById('benefitValue');
    const benefitLabels = ['Marginal', 'Moderate', 'High', 'Very High', 'Gamechanger'];
    
    if (benefitSlider && benefitValue) {
        benefitSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            benefitValue.textContent = benefitLabels[value - 1];
        });
    }
}

function showPage(pageName) {
    // Hide all pages
    Object.values(pages).forEach(page => {
        page.style.display = 'none';
    });
    
    // Show requested page
    if (pages[pageName]) {
        pages[pageName].style.display = 'block';
        
        // Update navigation
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === pageName) {
                link.classList.add('active');
            }
        });
        
        // Load page-specific data
        switch(pageName) {
            case 'home':
                loadHomePageData();
                break;
            case 'dashboard':
                if (currentUser) {
                    loadDashboardData();
                } else {
                    showPage('login');
                }
                break;
        }
    }
}

async function checkAuthStatus() {
    if (!authToken) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAuthUI();
        } else {
            // Token is invalid
            handleLogout();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        handleLogout();
    }
}

function updateAuthUI() {
    if (currentUser) {
        navUser.style.display = 'flex';
        authBtn.style.display = 'none';
        dashboardLink.style.display = 'block';
        userName.textContent = currentUser.display_name;
        
        // Hide submit idea button for SDMs
        const submitIdeaBtn = document.getElementById('submitIdeaBtn');
        if (submitIdeaBtn) {
            if (currentUser.role === 'SDM') {
                submitIdeaBtn.style.display = 'none';
            } else {
                submitIdeaBtn.style.display = 'block';
            }
        }
    } else {
        navUser.style.display = 'none';
        authBtn.style.display = 'block';
        dashboardLink.style.display = 'none';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    themeToggle.textContent = newTheme === 'light' ? '🌙' : '☀️';
    
    // Save theme preference
    localStorage.setItem('theme', newTheme);
}

function switchAuthTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update forms
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    document.getElementById(`${tabName}Form`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const credentials = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            updateAuthUI();
            showToast('Login successful!', 'success');
            hideModal('authModal');
            showPage('dashboard');
            
            // Clear form
            e.target.reset();
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const userData = {
        username: formData.get('username'),
        display_name: formData.get('display_name'),
        email: formData.get('email'),
        password: formData.get('password'),
        role: formData.get('role')  // Add selected role
    };
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            updateAuthUI();
            showToast('Registration successful!', 'success');
            hideModal('authModal');
            showPage('dashboard');
            
            // Clear form
            e.target.reset();
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    updateAuthUI();
    showToast('Logged out successfully', 'success');
    showPage('home');
}

async function loadHomePageData() {
    try {
        const response = await fetch(`${API_BASE_URL}/leaderboard/`);
        
        if (response.ok) {
            const data = await response.json();
            updateHomePageStats(data);
            updateLeaderboard(data.leaderboard);
            updateRecentActivities(data.recent_activities);
        } else {
            console.error('Failed to load leaderboard data:', response.status);
            // Show empty state
            updateHomePageStats({ leaderboard: [] });
            updateLeaderboard([]);
            updateRecentActivities([]);
        }
    } catch (error) {
        console.error('Failed to load home page data:', error);
        // Show empty state on error
        updateHomePageStats({ leaderboard: [] });
        updateLeaderboard([]);
        updateRecentActivities([]);
    }
}

function updateHomePageStats(data) {
    const leaderboard = data.leaderboard || [];
    const totalIdeas = leaderboard.reduce((sum, user) => sum + (user.total_ideas || 0), 0);
    const totalPoints = leaderboard.reduce((sum, user) => sum + (user.total_points || 0), 0);
    const activeUsers = leaderboard.length;
    
    document.getElementById('totalIdeas').textContent = totalIdeas;
    document.getElementById('approvedIdeas').textContent = totalIdeas;
    document.getElementById('totalPoints').textContent = totalPoints;
    document.getElementById('activeUsers').textContent = activeUsers;
}

function updateLeaderboard(leaderboard) {
    const podiumContainer = document.getElementById('podiumContainer');
    const rankingList = document.getElementById('rankingList');
    
    podiumContainer.innerHTML = '';
    rankingList.innerHTML = '';
    
    if (!leaderboard || leaderboard.length === 0) {
        podiumContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No data available</div>';
        return;
    }
    
    // Create podium-style bar chart for top 3 performers
    const barsContainer = document.createElement('div');
    barsContainer.className = 'leaderboard-bars';
    
    const top3 = leaderboard.slice(0, 3); // Show top 3 as podium
    if (top3.length === 0) return;
    
    const maxPoints = Math.max(...top3.map(user => user.total_points));
    
    // Arrange in podium order: 2nd (left), 1st (center), 3rd (right)
    const podiumOrder = [];
    if (top3[1]) podiumOrder.push({ ...top3[1], rank: 2, position: 'left' });   // Silver left
    if (top3[0]) podiumOrder.push({ ...top3[0], rank: 1, position: 'center' }); // Gold center
    if (top3[2]) podiumOrder.push({ ...top3[2], rank: 3, position: 'right' });  // Bronze right
    
    podiumOrder.forEach((user) => {
        const barItem = document.createElement('div');
        barItem.className = `leaderboard-bar podium-${user.position}`;
        
        // Different heights for podium effect
        let baseHeight;
        if (user.rank === 1) baseHeight = 170; // Tallest
        else if (user.rank === 2) baseHeight = 125; // Medium
        else baseHeight = 90; // Shortest
        
        const barHeight = Math.max(baseHeight, 55);
        
        barItem.innerHTML = `
            <div class="bar-container">
                <div class="bar rank-${user.rank}" style="height: ${barHeight}px">
                    <div class="bar-value">${user.total_points}</div>
                </div>
            </div>
            <div class="bar-user">
                <div class="bar-name">${user.display_name}</div>
                <div class="bar-username">@${user.username}</div>
            </div>
        `;
        
        barsContainer.appendChild(barItem);
    });
    
    podiumContainer.appendChild(barsContainer);
    
    // Create ranking list for remaining users
    const remaining = leaderboard.slice(3);
    remaining.forEach((user, index) => {
        const rank = index + 4; // Start from 4th position
        const rankingItem = document.createElement('div');
        rankingItem.className = 'ranking-item';
        
        rankingItem.innerHTML = `
            <div class="ranking-position">${rank}</div>
            <div class="ranking-info">
                <div class="ranking-name">${user.display_name}</div>
                <div class="ranking-username">@${user.username}</div>
            </div>
            <div class="ranking-stats">
                <div class="ranking-points">${user.total_points}</div>
                <div class="ranking-ideas">${user.total_ideas} ideas</div>
            </div>
        `;
        
        rankingList.appendChild(rankingItem);
    });
}

function updateRecentActivities(activities) {
    const activitiesContainer = document.getElementById('activitiesContainer');
    
    if (!activities || activities.length === 0) {
        activitiesContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No recent activities</div>';
        return;
    }
    
    const activitiesList = document.createElement('div');
    activitiesList.className = 'activities-list';
    
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        item.innerHTML = `
            <div class="activity-content">
                <div class="activity-title">${activity.engineer_name} - ${activity.category}</div>
                <div class="activity-meta">Submitted on ${new Date(activity.submission_date).toLocaleDateString()}</div>
            </div>
            <div class="activity-points">+${activity.points} pts</div>
        `;
        
        activitiesList.appendChild(item);
    });
    
    activitiesContainer.innerHTML = '';
    activitiesContainer.appendChild(activitiesList);
}

async function loadDashboardData() {
    if (!currentUser) {
        console.error('No current user found');
        showToast('Please log in to access dashboard', 'error');
        showPage('login');
        return;
    }
    
    if (!authToken) {
        console.error('No auth token found');
        showToast('Please log in to access dashboard', 'error');
        showPage('login');
        return;
    }
    
    console.log('Loading dashboard for user:', currentUser.role);
    
    if (currentUser.role === 'Service Engineer') {
        showServiceEngineerDashboard();
        await loadServiceEngineerData();
    } else if (currentUser.role === 'SDM') {
        showSDMDashboard();
        await loadSDMData();
    } else {
        console.error('Unknown user role:', currentUser.role);
        showToast('Unknown user role', 'error');
    }
}

function showServiceEngineerDashboard() {
    document.getElementById('serviceDashboard').style.display = 'block';
    document.getElementById('sdmDashboard').style.display = 'none';

    // Update welcome message and avatar
    if (currentUser) {
        document.getElementById('welcomeMessage').textContent = `Welcome ${currentUser.display_name}!`;
        document.getElementById('userAvatar').src = currentUser.avatar_data;
    }
}

function showSDMDashboard() {
    document.getElementById('serviceDashboard').style.display = 'none';
    document.getElementById('sdmDashboard').style.display = 'block';

    // Update welcome message and avatar
    if (currentUser) {
        document.getElementById('welcomeMessageSDM').textContent = `Welcome ${currentUser.display_name}!`;
        document.getElementById('userAvatarSDM').src = currentUser.avatar_data;
    }
}

async function loadServiceEngineerData() {
    try {
        console.log('Loading Service Engineer data...');
        const response = await fetch(`${API_BASE_URL}/ideas/my-ideas`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Service Engineer data loaded:', data);
            updateUserStats(data.ideas || []);
            updateMyIdeasList(data.ideas || []);
        } else {
            console.error('Failed to load Service Engineer data:', response.status);
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            showToast(errorData.error || 'Failed to load ideas', 'error');
            // Show empty state
            updateUserStats([]);
            updateMyIdeasList([]);
        }
    } catch (error) {
        console.error('Failed to load service engineer data:', error);
        showToast('Failed to load dashboard data', 'error');
        // Show empty state
        updateUserStats([]);
        updateMyIdeasList([]);
    }
}

async function loadSDMData() {
    try {
        const [worklistResponse, approvedResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/ideas/worklist`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }),
            fetch(`${API_BASE_URL}/ideas/approved/all`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            })
        ]);
        
        let worklistData = { ideas: [] };
        let approvedData = { ideas: [] };
        
        if (worklistResponse.ok) {
            worklistData = await worklistResponse.json();
        } else {
            console.error('Failed to load worklist:', worklistResponse.status);
        }
        
        if (approvedResponse.ok) {
            approvedData = await approvedResponse.json();
        } else {
            console.error('Failed to load approved ideas:', approvedResponse.status);
        }
        
        const enrichedWorklist = await enrichIdeaList(worklistData.ideas || []);
        const enrichedApproved = await enrichIdeaList(approvedData.ideas || []);

        updateSDMStats(enrichedWorklist, enrichedApproved);
        updateWorklistIdeas(enrichedWorklist);
        updateApprovedIdeasList(enrichedApproved);
        
    } catch (error) {
        console.error('Failed to load SDM data:', error);
        showToast('Failed to load dashboard data', 'error');
        // Show empty state
        updateSDMStats([], []);
        updateWorklistIdeas([]);
        updateApprovedIdeasList([]);
    }
}

function updateUserStats(ideas) {
    // Ensure ideas is an array
    const ideasArray = Array.isArray(ideas) ? ideas : [];
    
    const stats = {
        total: ideasArray.length,
        approved: ideasArray.filter(idea => idea && idea.status === 'approved').length,
        pending: ideasArray.filter(idea => idea && idea.status === 'pending').length,
        rejected: ideasArray.filter(idea => idea && idea.status === 'rejected').length,
        totalPoints: ideasArray.reduce((sum, idea) => sum + (idea && idea.points ? idea.points : 0), 0)
    };
    
    const statsGrid = document.getElementById('userStatsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon icon-ideas"><img src="assets/ideas.png" alt="Total Ideas"></div>
            <div class="stat-content">
                <div class="stat-number">${stats.total}</div>
                <div class="stat-label">Total Idea(s)</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-approved"><img src="assets/approved.png" alt="Approved Ideas"></div>
            <div class="stat-content">
                <div class="stat-number">${stats.approved}</div>
                <div class="stat-label">Approved Idea(s)</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-pending"><img src="assets/pending.png" alt="Pending Ideas"></div>
            <div class="stat-content">
                <div class="stat-number">${stats.pending}</div>
                <div class="stat-label">Pending Idea(s)</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-points"><img src="assets/points.png" alt="Total Points"></div>
            <div class="stat-content">
                <div class="stat-number">${stats.totalPoints}</div>
                <div class="stat-label">Total Points</div>
            </div>
        </div>
    `;
}

function updateSDMStats(worklistIdeas, approvedIdeas) {
    // Ensure arrays
    const worklistArray = Array.isArray(worklistIdeas) ? worklistIdeas : [];
    const approvedArray = Array.isArray(approvedIdeas) ? approvedIdeas : [];
    
    const totalPoints = approvedArray.reduce((sum, idea) => sum + (idea && idea.points ? idea.points : 0), 0);
    const avgPoints = approvedArray.length > 0 ? Math.round(totalPoints / approvedArray.length) : 0;
    
    const statsGrid = document.getElementById('sdmStatsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon icon-pending"><img src="assets/pending.png" alt="Pending Ideas"></div>
            <div class="stat-content">
                <div class="stat-number">${worklistArray.length}</div>
                <div class="stat-label">Pending Idea(s)</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-approved"><img src="assets/approved.png" alt="Approved Ideas"></div>
            <div class="stat-content">
                <div class="stat-number">${approvedArray.length}</div>
                <div class="stat-label">Approved Idea(s)</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-points"><img src="assets/points.png" alt="Points Awarded"></div>
            <div class="stat-content">
                <div class="stat-number">${totalPoints}</div>
                <div class="stat-label">Points Awarded</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon icon-analytics"><img src="assets/contributors.png" alt="Avg Points"></div>
            <div class="stat-content">
                <div class="stat-number">${avgPoints}</div>
                <div class="stat-label">Avg Points</div>
            </div>
        </div>
    `;
}

function updateMyIdeasList(ideas) {
    const ideasList = document.getElementById('myIdeasList');
    ideasList.innerHTML = '';
    
    // Ensure ideas is an array
    const ideasArray = Array.isArray(ideas) ? ideas : [];
    
    if (ideasArray.length === 0) {
        ideasList.innerHTML = `
            <div class="text-center" style="padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">💡</div>
                <h3>No ideas submitted yet</h3>
                <p style="color: var(--text-secondary);">Ready to share your first innovative idea?</p>
            </div>
        `;
        return;
    }
    
    ideasArray.forEach(idea => {
        if (idea) {  // Ensure idea is not null/undefined
            const ideaCard = createIdeaCard(idea, 'service-engineer');
            ideasList.appendChild(ideaCard);
        }
    });
}

async function updateWorklistIdeas(ideas) {
    const worklistContainer = document.getElementById('worklistIdeas');
    worklistContainer.innerHTML = '';
    
    // Ensure ideas is an array
    const ideasArray = Array.isArray(ideas) ? ideas : [];
    
    if (ideasArray.length === 0) {
        worklistContainer.innerHTML = `
            <div class="text-center" style="padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
                <h3>No pending ideas</h3>
                <p style="color: var(--text-secondary);">All ideas have been reviewed.</p>
            </div>
        `;
        return;
    }
    
    ideasArray.forEach(idea => {
        if (idea) {  // Ensure idea is not null/undefined
            const ideaCard = createSDMWorklistCard(idea);
            worklistContainer.appendChild(ideaCard);
        }
    });
}

function updateApprovedIdeasList(ideas) {
    const approvedContainer = document.getElementById('approvedIdeasList');
    approvedContainer.innerHTML = '';
    
    // Ensure ideas is an array
    const ideasArray = Array.isArray(ideas) ? ideas : [];
    
    if (ideasArray.length === 0) {
        approvedContainer.innerHTML = `
            <div class="text-center" style="padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
                <h3>No approved ideas yet</h3>
                <p style="color: var(--text-secondary);">Start reviewing ideas to see approved ones here.</p>
            </div>
        `;
        return;
    }
    
    ideasArray.forEach(idea => {
        if (idea) {  // Ensure idea is not null/undefined
            const ideaCard = createIdeaCard(idea, 'sdm-approved');
            approvedContainer.appendChild(ideaCard);
        }
    });
}

function createSDMWorklistCard(idea) {
    const card = document.createElement('div');
    card.className = 'idea-card sdm-worklist-card';
    
    // Get benefit level text
    const benefitLevels = ['Marginal', 'Moderate', 'High', 'Very High', 'Gamechanger'];
    const benefitText = benefitLevels[parseInt(idea.benefit_level) - 1] || idea.benefit_level;
    
    const detailedDescription = buildIdeaDescription(idea);
    
    card.innerHTML = `
        <div class="idea-header">
            <div class="idea-tags">
                <span class="tag category">${idea.category || 'Unknown'}</span>
                <span class="tag benefit">${benefitText}</span>
            </div>
            <div class="idea-status-badge pending">Pending Review</div>
        </div>
        <h4 style="margin: 1rem 0 0.5rem 0; color: var(--text-primary);">${idea.title || 'Untitled Idea'}</h4>
        <p style="color: var(--text-secondary); margin-bottom: 0.5rem; line-height: 1.4;">${detailedDescription.substring(0, 150)}${detailedDescription.length > 150 ? '...' : ''}</p>
        
        <div class="sdm-actions">
            <button class="btn-approve btn-compact" data-idea-id="${idea.id}" data-idea-title="${idea.title || 'Untitled Idea'}">
                Approve
            </button>
            <button class="btn-reject btn-compact" data-idea-id="${idea.id}" data-idea-title="${idea.title || 'Untitled Idea'}">
                Reject
            </button>
            <button class="btn-similarity btn-compact" data-idea-id="${idea.id}" data-idea-title="${idea.title || 'Untitled Idea'}">
                Similarity Check
            </button>
        </div>
    `;
    
    // Add click handler for idea details (but not on buttons)
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.sdm-actions')) {
            showIdeaDetails(idea);
        }
    });
    
    return card;
}

function createIdeaCard(idea, context) {
    const card = document.createElement('div');
    card.className = 'idea-card';
    
    // For approved ideas, don't try to enrich since the endpoint may not exist
    // Just use the data as-is
    
    let statusClass = 'status';
    if (idea.status === 'approved') statusClass += ' approved';
    else if (idea.status === 'rejected') statusClass += ' rejected';
    else statusClass += ' pending';
    
    // Get benefit level text
    const benefitLevels = ['Marginal', 'Moderate', 'High', 'Very High', 'Gamechanger'];
    const benefitText = benefitLevels[parseInt(idea.benefit_level) - 1] || idea.benefit_level;
    
    const detailedDescription = buildIdeaDescription(idea);
    
    let pointsHTML = '';
    if (idea.status === 'approved') {
        pointsHTML = `<div class="idea-points">+${idea.points} pts</div>`;
    } else if (idea.status === 'pending') {
        pointsHTML = `<div style="color: var(--warning);">Pending Review</div>`;
    } else if (idea.status === 'rejected') {
        pointsHTML = `<div style="color: var(--error);">Rejected</div>`;
    }
    
    // Different layout for SE vs SDM
    if (context === 'sdm-worklist' || context === 'sdm-approved') {
        // SDM view - show engineer info
        card.innerHTML = `
            <div class="idea-header">
                <div class="idea-tags">
                    <span class="tag category">${idea.category || 'Unknown'}</span>
                    <span class="tag benefit">${benefitText}</span>
                </div>
                ${pointsHTML}
            </div>
            <h4 style="margin: 1rem 0 0.5rem 0; color: var(--text-primary);">${idea.title || 'Untitled Idea'}</h4>
            <p style="color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.4;">${detailedDescription.substring(0, 150)}${detailedDescription.length > 150 ? '...' : ''}</p>
            
            <div class="idea-meta-row">
                <div class="idea-meta-item">
                    <strong>Service Area:</strong> ${idea.service_area || 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>Submitted:</strong> ${idea.submission_date ? new Date(idea.submission_date).toLocaleDateString() : 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>Engineer:</strong> ${idea.engineer_name || 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>Implemented:</strong> ${idea.implemented ? 'Yes' : 'No'}
                </div>
            </div>
            
            ${idea.rejection_reason ? `
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 82, 82, 0.1); border: 1px solid var(--error); border-radius: 0.5rem;">
                    <strong style="color: var(--error);">Rejection Reason:</strong> ${idea.rejection_reason}
                </div>
            ` : ''}
        `;
    } else {
        // SE view - simplified layout without status badges
        card.innerHTML = `
            <div class="idea-header">
                <div class="idea-tags">
                    <span class="tag category">${idea.category || 'Unknown'}</span>
                    <span class="tag benefit">${benefitText}</span>
                </div>
                ${pointsHTML}
            </div>
            <h4 style="margin: 1rem 0 0.5rem 0; color: var(--text-primary);">${idea.title || 'Untitled Idea'}</h4>
            <p style="color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.4;">${detailedDescription.substring(0, 150)}${detailedDescription.length > 150 ? '...' : ''}</p>
            
            <div class="idea-meta-row">
                <div class="idea-meta-item">
                    <strong>Service Area:</strong> ${idea.service_area || 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>Submitted:</strong> ${idea.submission_date ? new Date(idea.submission_date).toLocaleDateString() : 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>SDM:</strong> ${idea.assigned_sdm_name || 'Unknown'}
                </div>
                <div class="idea-meta-item">
                    <strong>Implemented:</strong> ${idea.implemented ? 'Yes' : 'No'}
                </div>
            </div>
        `;
    }
    
    // Add click handler for idea details
    card.addEventListener('click', () => showIdeaDetails(idea));
    
    return card;
}

async function showIdeaDetails(idea) {
    const modal = document.getElementById('ideaDetailsModal');
    const content = document.getElementById('ideaDetailsContent');

    const enrichedIdea = await enrichIdeaWithDetails(idea);

    // Get detailed description based on category
    const detailedDescription = buildIdeaDescription(enrichedIdea);

    // Get benefit level text for modal
    const benefitLevels = ['Marginal', 'Moderate', 'High', 'Very High', 'Gamechanger'];
    const benefitText = benefitLevels[parseInt(enrichedIdea.benefit_level) - 1] || enrichedIdea.benefit_level;

    // Different layout based on current user role
    const isSDM = currentUser && currentUser.role === 'SDM';

    content.innerHTML = `
        <div class="idea-details" style="padding: 2rem;">
            <div class="idea-header">
                <h2>${enrichedIdea.title || 'Untitled Idea'}</h2>
            </div>

            <div class="idea-tags-row" style="margin: 1rem 0; display: flex; justify-content: space-between; align-items: center;">
                <div class="idea-tags">
                    <span class="tag category">${enrichedIdea.category || 'Unknown'}</span>
                    <span class="tag benefit">${benefitText}</span>
                    ${enrichedIdea.status === 'approved' ? `<span class="tag points">+${enrichedIdea.points} pts</span>` : ''}
                </div>
                <div class="idea-status-badge ${enrichedIdea.status === 'approved' ? 'approved' : enrichedIdea.status === 'rejected' ? 'rejected' : 'pending'}">
                    ${enrichedIdea.status === 'approved' ? 'Approved' : enrichedIdea.status === 'rejected' ? 'Rejected' : 'Pending'}
                </div>
            </div>

            <div class="idea-description">
                <h4>Description</h4>
                <p style="white-space: pre-line;">${detailedDescription}</p>
            </div>

            <div class="idea-meta-modal">
                <div class="meta-row-modal">
                    <div class="meta-column">
                        <div class="idea-meta-item">
                            <strong>Service Area:</strong> ${enrichedIdea.service_area || 'Unknown'}
                        </div>
                        <div class="idea-meta-item">
                            <strong>${isSDM ? 'Engineer' : 'SDM'}:</strong> ${isSDM ? (enrichedIdea.engineer_name || 'Unknown') : (enrichedIdea.assigned_sdm_name || 'Nachi')}
                        </div>
                    </div>
                    <div class="meta-column">
                        <div class="idea-meta-item">
                            <strong>Submitted:</strong> ${enrichedIdea.submission_date ? new Date(enrichedIdea.submission_date).toLocaleDateString() : 'Unknown'}
                        </div>
                        <div class="idea-meta-item">
                            <strong>Implemented:</strong> ${enrichedIdea.implemented ? 'Yes' : 'No'}
                        </div>
                    </div>
                </div>
                ${isSDM && enrichedIdea.status === 'pending' ? `
                    <div class="modal-actions" style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center;">
                        <button class="btn-approve btn-compact" data-idea-id="${enrichedIdea.id}" data-idea-title="${enrichedIdea.title || 'Untitled Idea'}">
                            Approve
                        </button>
                        <button class="btn-reject btn-compact" data-idea-id="${enrichedIdea.id}" data-idea-title="${enrichedIdea.title || 'Untitled Idea'}">
                            Reject
                        </button>
                    </div>
                ` : ''}
            </div>
            
            ${enrichedIdea.rejection_reason ? `
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 82, 82, 0.1); border: 1px solid var(--error); border-radius: 0.5rem;">
                    <strong style="color: var(--error);">Rejection Reason:</strong> ${enrichedIdea.rejection_reason}
                </div>
            ` : ''}
        </div>
    `;

    showModal('ideaDetailsModal');
}

function approveIdea(ideaId, ideaTitle = 'this idea') {
    console.log('approveIdea called with:', ideaId, ideaTitle);
    currentIdeaId = ideaId;
    currentIdeaTitle = ideaTitle;
    
    const titleElement = document.getElementById('approvalIdeaTitle');
    if (titleElement) titleElement.textContent = ideaTitle;
    
    showModal('approvalModal');
}

function rejectIdea(ideaId, ideaTitle = 'this idea') {
    console.log('rejectIdea called with:', ideaId, ideaTitle);
    currentIdeaId = ideaId;
    currentIdeaTitle = ideaTitle;
    
    const titleElement = document.getElementById('rejectionIdeaTitle');
    const reasonElement = document.getElementById('rejectionReason');
    
    if (titleElement) titleElement.textContent = ideaTitle;
    if (reasonElement) reasonElement.value = '';
    
    showModal('rejectionModal');
}

function checkSimilarity(ideaId, ideaTitle = 'this idea') {
    console.log('checkSimilarity called with:', ideaId, ideaTitle);
    
    showLoading(true);
    
    fetch(`${API_BASE_URL}/ideas/${ideaId}/similarity`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        displaySimilarityResults(data.similar_ideas, ideaTitle);
        showModal('similarityModal');
    })
    .catch(error => {
        console.error('Failed to check similarity:', error);
        showToast('Failed to check similarity', 'error');
    })
    .finally(() => {
        showLoading(false);
    });
}

function displaySimilarityResults(similarIdeas, originalTitle) {
    const resultsContainer = document.getElementById('similarityResults');
    
    if (!similarIdeas || similarIdeas.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <p>No similar ideas found for "${originalTitle}".</p>
            </div>
        `;
        return;
    }
    
    let html = `<h4>Similar ideas to "${originalTitle}"</h4>`;
    
    similarIdeas.forEach(idea => {
        const statusBadge = idea.status === 'approved' ? 
            '<span class="status-badge approved">Approved</span>' : 
            '<span class="status-badge pending">Pending</span>';
            
        html += `
            <div class="similarity-item">
                <div class="similarity-header">
                    <h5>${idea.title || 'Untitled Idea'}</h5>
                    <div class="similarity-score">${idea.similarity_score}% match</div>
                </div>
                <div class="similarity-meta">
                    <span class="tag category">${idea.category || 'Unknown'}</span>
                    ${statusBadge}
                </div>
                <p class="similarity-description">${(idea.description || '').substring(0, 100)}${(idea.description || '').length > 100 ? '...' : ''}</p>
            </div>
        `;
    });
    
    resultsContainer.innerHTML = html;
}

async function confirmApproval() {
    if (!currentIdeaId) return;
    
    hideModal('approvalModal');
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/ideas/${currentIdeaId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Idea approved successfully!', 'success');
            loadDashboardData(); // Refresh the dashboard
        } else {
            showToast(data.error || 'Failed to approve idea', 'error');
        }
    } catch (error) {
        console.error('Failed to approve idea:', error);
        showToast('Failed to approve idea', 'error');
    } finally {
        showLoading(false);
        currentIdeaId = null;
        currentIdeaTitle = null;
    }
}

async function confirmRejection() {
    if (!currentIdeaId) return;
    
    const reason = document.getElementById('rejectionReason').value.trim();
    if (!reason) {
        showToast('Please provide a rejection reason', 'error');
        return;
    }
    
    if (reason.length < 5) {
        showToast('Rejection reason must be at least 5 characters', 'error');
        return;
    }
    
    hideModal('rejectionModal');
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/ideas/${currentIdeaId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejection_reason: reason })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Idea rejected successfully!', 'success');
            loadDashboardData(); // Refresh the dashboard
        } else {
            showToast(data.error || 'Failed to reject idea', 'error');
        }
    } catch (error) {
        console.error('Failed to reject idea:', error);
        showToast('Failed to reject idea', 'error');
    } finally {
        showLoading(false);
        currentIdeaId = null;
        currentIdeaTitle = null;
    }
}

async function showIdeaSubmissionModal() {
    // Load SDMs first
    try {
        const response = await fetch(`${API_BASE_URL}/users/sdms`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const sdmSelect = document.getElementById('ideaAssignedSDM');
            sdmSelect.innerHTML = '<option value="">Select SDM</option>';
            
            data.sdms.forEach(sdm => {
                const option = document.createElement('option');
                option.value = sdm.id;
                option.textContent = sdm.display_name;
                sdmSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load SDMs:', error);
    }
    
    showModal('ideaSubmissionModal');
}

function showCategoryFields(category) {
    // Hide all category fields
    document.getElementById('securityFields').style.display = 'none';
    document.getElementById('automationFields').style.display = 'none';
    document.getElementById('innovationFields').style.display = 'none';
    
    // Show relevant fields
    if (category === 'Security') {
        document.getElementById('securityFields').style.display = 'block';
    } else if (category === 'Automation') {
        document.getElementById('automationFields').style.display = 'block';
    } else if (category === 'Innovation') {
        document.getElementById('innovationFields').style.display = 'block';
    }
}

async function handleIdeaSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const category = formData.get('category');
    
    // Build description from category-specific content
    let description = '';
    if (category === 'Security') {
        const securityGap = formData.get('security_gap') || '';
        const possibleSolution = formData.get('possible_solution') || '';
        if (securityGap) description += `Security Gap: ${securityGap}`;
        if (possibleSolution) description += (description ? '\n\n' : '') + `Possible Solution: ${possibleSolution}`;
    } else if (category === 'Automation') {
        const automationOpportunity = formData.get('automation_opportunity') || '';
        const automationSolution = formData.get('automation_solution') || '';
        if (automationOpportunity) description += `Automation Opportunity: ${automationOpportunity}`;
        if (automationSolution) description += (description ? '\n\n' : '') + `Automation Solution: ${automationSolution}`;
    } else if (category === 'Innovation') {
        const innovativeIdea = formData.get('innovative_idea') || '';
        description = innovativeIdea;
    }
    
    const ideaData = {
        title: formData.get('title'),
        category: category,
        description: description,
        service_area: formData.get('service_area'),
        benefit_level: formData.get('benefit_level'),
        assigned_sdm_id: formData.get('assigned_sdm_id'),
        implemented: formData.has('implemented'),
        security_gap: formData.get('security_gap') || '',
        possible_solution: formData.get('possible_solution') || '',
        automation_opportunity: formData.get('automation_opportunity') || '',
        automation_solution: formData.get('automation_solution') || '',
        innovative_idea: formData.get('innovative_idea') || ''
    };
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/ideas/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(ideaData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Idea submitted successfully!', 'success');
            hideModal('ideaSubmissionModal');
            e.target.reset();
            
            // Reset category fields visibility
            document.getElementById('securityFields').style.display = 'none';
            document.getElementById('automationFields').style.display = 'none';
            document.getElementById('innovationFields').style.display = 'none';
            
            // Reset benefit value display
            const benefitValue = document.getElementById('benefitValue');
            if (benefitValue) benefitValue.textContent = 'High';
            
            // Refresh dashboard data
            if (currentUser.role === 'Service Engineer') {
                loadServiceEngineerData();
            }
        } else {
            showToast(data.error || 'Failed to submit idea', 'error');
        }
    } catch (error) {
        console.error('Failed to submit idea:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}


function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto remove after 2.5 seconds (to allow 0.3s fade out)
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300); // Match animation duration
    }, 2500);
}
