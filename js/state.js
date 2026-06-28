// =================================================================
// STATE.JS
// Hanterar all data och interaktioner med localStorage.
// =================================================================
// Hämta inloggad användare från minnet
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
// Om ingen användare är inloggad, skicka tillbaka till login.html
if (!currentUser) {
  window.location.href = 'login.html';
}

// NYTT: Migrera användarobjektet för att inkludera inställningar.
if (currentUser && !currentUser.settings) {
  currentUser.settings = {
    notifications: {
      enabled: true,
      sound: true,
      showContent: true,
    }
  };
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
}

// Läs in ALLA användare från minnet, eller starta med bara den inloggade
let allUsers = JSON.parse(localStorage.getItem('allUsers')) || { [currentUser.id]: currentUser };
const currentUserId = currentUser.id;

// Säkerställ att Kollegabot finns
if (!allUsers['user2']) {
  allUsers['user2'] = { name: 'Kollegabot', avatarChar: '🤖', colorClass: 'magenta', channels: [], statusMessage: 'Jag är en hjälpsam bot!' };
  // Spara direkt så att boten blir permanent
  localStorage.setItem('allUsers', JSON.stringify(allUsers));
}

// Läs in ALLA kanaler från minnet, eller använd en tom mall
let allChannels = JSON.parse(localStorage.getItem('allChannels')) || {};

// Läs in ALLA meddelanden från minnet
let allMessages = JSON.parse(localStorage.getItem('chatMessages')) || {};

// Säkerställ att alla kanaler har en meddelandelista och medlemslista
Object.keys(allChannels).forEach(chId => {
  if (!allMessages[chId]) allMessages[chId] = [];
  if (!allChannels[chId].members) allChannels[chId].members = [];
  // NYTT: Migrera från enstaka fäst meddelande till en lista
  // Detta säkerställer bakåtkompatibilitet.
  if (allChannels[chId].pinnedMessageIndex !== undefined) {
    if (allChannels[chId].pinnedMessageIndex !== null) {
      allChannels[chId].pinnedMessageIndices = [allChannels[chId].pinnedMessageIndex];
    }
    delete allChannels[chId].pinnedMessageIndex;
  }
});

// Hämta den senast valda kanalen
let currentChannelId = localStorage.getItem('currentChannelId');

// --- Globala konstanter ---
const MESSAGE_TYPES = {
  'message': { label: 'Meddelande', icon: 'ph-chat' },
  'task': { label: 'Uppgift', icon: 'ph-check-square' }
};

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔'];

const USER_COLORS = {
  'cyan': '#e7f3fa',
  'magenta': '#fce8ef',
  'green': '#eaf4e8',
  'orange': '#fef3e7'
};

// --- Funktioner för att uppdatera state ---

function updateLastSeen() {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  if (user) {
    user.lastSeen = new Date().toISOString();
    saveCurrentUser(user);
  }
}

function saveMessages() {
  localStorage.setItem('chatMessages', JSON.stringify(allMessages));
}

function saveChannels() {
  localStorage.setItem('allChannels', JSON.stringify(allChannels));
}

function saveAllUsers() {
  localStorage.setItem('allUsers', JSON.stringify(allUsers));
}

function saveCurrentUser(user) {
  localStorage.setItem('currentUser', JSON.stringify(user));
}

function calculateStatus(lastSeen, doNotDisturb) {
  if (doNotDisturb) return { text: 'Stör ej', key: 'dnd' };

  if (!lastSeen) return { text: 'Inaktiv', key: 'inactive' };

  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffMinutes = (now - lastSeenDate) / (1000 * 60);

  if (diffMinutes < 5) {
    return { text: 'Aktiv nu', key: 'active' };
  }
  if (diffMinutes < 30) {
    return { text: `Sågs för ${Math.round(diffMinutes)} min sedan`, key: 'away' };
  }
  return { text: 'Inaktiv', key: 'inactive' };
}