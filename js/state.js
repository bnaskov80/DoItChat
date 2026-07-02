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
let currentProfileUserId = null; // NYTT: Spåra vilken profil som visas

// Initiera Firebase-tjänster
const auth = firebase.auth();
const db = firebase.firestore();

// Hållare för våra realtidslyssnare så vi kan stänga dem vid utloggning
let unsubscribeListeners = [];

// Spåra tidigare inbjudningar för att detektera nya
let previousInvitesCount = 0;

function upsertMessageToState(channelId, msgData) {
  if (!channelId) return null;
  if (!allMessages[channelId]) {
    allMessages[channelId] = [];
  }

  const msgIndex = allMessages[channelId].findIndex(m => m.id === msgData.id);
  if (msgIndex > -1) {
    allMessages[channelId][msgIndex] = { ...allMessages[channelId][msgIndex], ...msgData };
    return msgIndex;
  }

  allMessages[channelId].push(msgData);
  return allMessages[channelId].length - 1;
}

function removeMessageFromState(channelId, messageId) {
  if (!channelId || !allMessages[channelId]) return;
  const msgIndex = allMessages[channelId].findIndex(m => m.id === messageId);
  if (msgIndex > -1) {
    allMessages[channelId].splice(msgIndex, 1);
  }
}

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
    let isInitialLoad = true; // Flagga för att hantera första dataladdningen
    const messagesUnsubscribe = db.collection('messages').onSnapshot(snapshot => {
      let needsFullRerender = false;

      snapshot.docChanges().forEach(change => {
        const msgData = { ...change.doc.data(), id: change.doc.id };
        const channelId = msgData.channelId;

        if (!channelId) return;

        if (change.type === "added") {
          upsertMessageToState(channelId, msgData);

          if (msgData.userId !== currentUserId) {
            needsFullRerender = true;
          }

          // KORRIGERING: Ta bort all logik relaterad till Kollegabot.
          // Notifiera endast om omnämnanden från andra användare.
          if (msgData.userId !== currentUserId && msgData.type !== 'system' && msgData.text) {
            const myName = currentUser?.name;
            if (myName && msgData.text.includes(`@${myName}`)) {
              const senderName = allUsers[msgData.userId]?.name || 'Någon';
              const channelName = allChannels[channelId]?.name || 'en kanal';
              showNotification(`${senderName} nämnde dig i ${channelName}`, { body: msgData.text });
            }
          }
        } else if (change.type === "modified") {
          upsertMessageToState(channelId, msgData);
          needsFullRerender = true;
        } else if (change.type === "removed") {
          removeMessageFromState(channelId, msgData.id);
          needsFullRerender = true;
        }
      });

      // KORRIGERING: Ommritning måste ske vid första sidladdningen och när data ändras.
      // Denna nya logik säkerställer att vyn uppdateras korrekt utan att störa
      // animationen för meddelanden som den egna användaren skickar.
      if (isInitialLoad || needsFullRerender) {
        syncAndRerenderAllViews();
      }

      if (isInitialLoad) {
        isInitialLoad = false;
        resolve(); // Säkerställ att Promise bara resolvas en gång
      }
    });
    unsubscribeListeners.push(messagesUnsubscribe);
  });

  // NYTT: Lyssnare för inbjudningar på den inloggade användaren
  const invitesPromise = new Promise(resolve => {
    let isInitialLoad = true;
    const invitesUnsubscribe = db.collection('users').doc(currentUserId).onSnapshot(doc => {
      if (doc.exists) {
        const userData = doc.data();
        const currentInvites = userData.pendingInvites || [];
        
        // Detektera nya inbjudningar och visa notis
        if (!isInitialLoad && currentInvites.length > previousInvitesCount) {
          // Hitta de nya inbjudningarna
          const newInvites = currentInvites.slice(previousInvitesCount);
          newInvites.forEach(invite => {
            const channel = allChannels[invite.channelId];
            const inviter = allUsers[invite.invitedBy];
            if (channel && inviter) {
              showNotification(`Ny inbjudan till ${channel.name}`, { 
                body: `${inviter.name} bjöd in dig till ${channel.name}`,
                tag: `invite-${invite.channelId}`
              });
              playNewMessageSound();
            }
          });
        }
        
        previousInvitesCount = currentInvites.length;
        currentUser = userData;
        if (typeof syncAndRerenderAllViews === 'function') syncAndRerenderAllViews();
      }
      
      if (isInitialLoad) {
        isInitialLoad = false;
        resolve();
      }
    });
    unsubscribeListeners.push(invitesUnsubscribe);
  });

  // Vänta tills den första datan från users och channels har laddats innan vi fortsätter.
  return Promise.all([usersPromise, channelsPromise, messagesPromise, invitesPromise]);
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