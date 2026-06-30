// =================================================================
// STATE.JS
// Hanterar globalt state och realtidsdata från Firestore.
// =================================================================

// Globala state-variabler
let currentUser = null;
let currentUserId = null;
let allUsers = {};
let allChannels = {};
let allMessages = {};
let currentChannelId = localStorage.getItem('currentChannelId'); // Behåll för enkelhetens skull

// Initiera Firebase-tjänster
const auth = firebase.auth();
const db = firebase.firestore();

// Hållare för våra realtidslyssnare så vi kan stänga dem vid utloggning
let unsubscribeListeners = [];

/**
 * Kärnan i den nya arkitekturen.
 * Denna funktion använder onAuthStateChanged för att centralt hantera användarens
 * inloggningsstatus. Den körs automatiskt när sidan laddas och varje gång
 * användarens autentiseringsstatus ändras (inloggning/utloggning).
 */
auth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    // Användaren är inloggad.
    console.log("Användare inloggad:", firebaseUser.uid);
    currentUserId = firebaseUser.uid;

    // Hämta användarens data från Firestore
    const userDoc = await db.collection('users').doc(currentUserId).get();

    if (userDoc.exists) {
      currentUser = userDoc.data();
      console.log("Hämtade currentUser från Firestore:", currentUser);
      
      // Starta realtidslyssnare för all data och initiera appen
      // när den första datan har hämtats.
      await setupRealtimeListeners();
      initApp();
    } else {
      // Detta är ett fel-läge, användaren finns i Auth men inte i Firestore.
      // Logga ut användaren för att undvika problem.
      console.error("Användardata saknas i Firestore! Loggar ut...");
      auth.signOut();
    }
  } else {
    // Användaren är inte inloggad.
    // Stoppa alla aktiva lyssnare för att undvika onödig datatrafik och fel.
    unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    unsubscribeListeners = [];

    console.log("Ingen användare inloggad, omdirigerar till login.html");
    // Om vi inte redan är på login.html, omdirigera dit.
    if (window.location.pathname !== '/login.html') {
      window.location.href = 'login.html';
    }
  }
});

/**
 * Sätter upp realtidslyssnare för alla nödvändiga kollektioner i Firestore.
 * Dessa kommer automatiskt att uppdatera vårt lokala state när datan ändras.
 */
async function setupRealtimeListeners() {
  const usersPromise = new Promise(resolve => {
    const usersUnsubscribe = db.collection('users').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        allUsers[change.doc.id] = change.doc.data();
      });
      console.log("Användare uppdaterade:", Object.keys(allUsers).length);
      if (typeof syncAndRerenderAllViews === 'function') syncAndRerenderAllViews();
      resolve();
    });
    unsubscribeListeners.push(usersUnsubscribe);
  });

  const channelsPromise = new Promise(resolve => {
    const channelsUnsubscribe = db.collection('channels').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "removed") {
          delete allChannels[change.doc.id];
        } else {
          allChannels[change.doc.id] = change.doc.data();
        }

        // NYTT: Om ändringen gäller den aktuella kanalen, rendera om skrivindikatorn.
        if (change.doc.id === currentChannelId) {
          renderTypingIndicator();
        }
      });
      console.log("Kanaler uppdaterade:", Object.keys(allChannels).length);
      if (typeof syncAndRerenderAllViews === 'function') syncAndRerenderAllViews();
      resolve();
    });
    unsubscribeListeners.push(channelsUnsubscribe);
  });

  const messagesPromise = new Promise(resolve => {
    const messagesUnsubscribe = db.collection('messages').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const msgData = { ...change.doc.data(), id: change.doc.id }; // NYTT: Spara alltid dokument-ID
        const channelId = msgData.channelId;

        // Säkerställ att kanalen finns i vårt lokala state
        if (!allMessages[msgData.channelId]) {
          allMessages[msgData.channelId] = [];
        }

        const msgIndex = allMessages[channelId].findIndex(m => m.id === msgData.id);

        if (change.type === "added") {
          if (msgIndex === -1) { // Undvik dubbletter
            // Lägg inte till meddelandet här om det är från den inloggade användaren.
            // Det hanteras redan "optimistiskt" i sendMessage för att kunna animeras.
            // Detta förhindrar att meddelandet ritas ut två gånger.
            if (msgData.userId !== currentUserId) allMessages[channelId].push(msgData);
          }
          
          // NYTT: Logik för "Nya meddelanden"-knappen
          if (channelId === currentChannelId && msgData.userId !== currentUserId) {
            const chatView = document.getElementById('chat-view');
            const chatFeed = chatView.querySelector('.chat-feed');
            const indicator = document.getElementById('new-messages-indicator');
            const inputArea = chatView.querySelector('.input-area');

            // Visa knappen om användaren inte är scrollad till botten
            if (chatFeed.scrollHeight - chatFeed.scrollTop > chatFeed.clientHeight + 100) {
              indicator.classList.remove('hidden');
              // Spara ID på det första olästa meddelandet
              if (!indicator.dataset.firstUnreadId) {
                indicator.dataset.firstUnreadId = msgData.id;
              }
            } else {
              chatFeed.scrollTop = chatFeed.scrollHeight; // Auto-scrolla om användaren är nära botten
            }
          }

          // NYTT: Kolla om Kollegabot ska svara.
          // Svara inte på egna meddelanden eller systemmeddelanden.
          if (msgData.userId !== 'user2' && msgData.type !== 'system') {
            if (msgData.text.toLowerCase().includes('hjälp')) {
              // Vänta en liten stund för en mer naturlig känsla.
              setTimeout(() => {
                sendBotMessage(channelId, 'Jag ser att du bad om hjälp! Jag kan inte göra så mycket än, men jag lär mig snabbt.');
              }, 1500);
            }
            // NYTT: Kolla om den inloggade användaren blev omnämnd.
            const myName = currentUser.name;
            if (msgData.text.includes(`@${myName}`)) {
              const senderName = allUsers[msgData.userId]?.name || 'Någon';
              const channelName = allChannels[channelId]?.name || 'en kanal';
              showNotification(`${senderName} nämnde dig i ${channelName}`, { body: msgData.text });
            }
          }
        } else if (change.type === "modified") {
          if (msgIndex > -1) allMessages[channelId][msgIndex] = msgData; // Uppdatera meddelandet
        } else if (change.type === "removed") {
          if (msgIndex > -1) allMessages[channelId].splice(msgIndex, 1); // Ta bort meddelandet
        }
      });
      // NYTT: Anropa bara en fullständig ommritning om ändringen INTE var ett tillägg.
      // Nya meddelanden hanteras nu direkt i UI:t för att kunna animeras korrekt.
      // KORRIGERING: Rita om hela vyn om något har tagits bort eller modifierats.
      // Detta är en enklare och mer robust lösning än att försöka uppdatera
      // enskilda element, vilket har orsakat problem.
      const hasModificationsOrDeletions = snapshot.docChanges().some(c => c.type === 'modified' || c.type === 'removed');
      
      if (hasModificationsOrDeletions) {
        syncAndRerenderAllViews();
      }
      resolve();
    });
    unsubscribeListeners.push(messagesUnsubscribe);
  });

  // Vänta tills den första datan från users och channels har laddats innan vi fortsätter.
  return Promise.all([usersPromise, channelsPromise, messagesPromise]);
}

// --- Globala konstanter ---
const MESSAGE_TYPES = {
  'message': { label: 'Meddelande', icon: 'ph-chat' },
  'task': { label: 'Uppgift', icon: 'ph-check-square' },
  'checklist': { label: 'Checklista', icon: 'ph-list-checks-new' }
};

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔'];

const USER_COLORS = {
  'cyan': '#e7f3fa',
  'magenta': '#fce8ef',
  'green': '#eaf4e8',
  'orange': '#fef3e7'
};

// --- Funktioner för att uppdatera state (kommer att bytas mot Firestore-anrop) ---

function updateLastSeen() {
  if (currentUserId) {
    db.collection('users').doc(currentUserId).update({
      lastSeen: new Date().toISOString()
    });
  }
}

function saveMessages() {
  // Ersätts av Firestore-anrop
}

function saveChannels() {
  // Ersätts av Firestore-anrop
}

function saveAllUsers() {
  // Ersätts av Firestore-anrop
}

function saveCurrentUser(user) {
  // Ersätts av Firestore-anrop
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