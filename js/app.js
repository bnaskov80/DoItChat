// =================================================================
// APP.JS
// Initiering, controll-logik och funktioner som binder samman
// state, UI och events.
// =================================================================

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Denna webbläsare stöder inte notiser.");
    return;
  }
  // Fråga bara om vi inte redan har fått nej.
  if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

function showNotification(title, options) {
  const user = JSON.parse(localStorage.getItem('currentUser'));

  // NYTT: Kontrollera användarens globala notisinställning.
  if (user?.settings?.notifications?.enabled === false) {
    return;
  }

  if (!("Notification" in window)) {
    return; // Webbläsaren stöder inte notiser.
  }

  // Visa bara notis om vi har tillåtelse och om användaren inte redan tittar på fliken.
  if (Notification.permission === "granted" && document.hidden) {
    const finalOptions = { ...options };
    new Notification(title, finalOptions);
  }
}

function playNewMessageSound() {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  // NYTT: Kontrollera användarens inställningar för ljud och globala notiser.
  if (user?.settings?.notifications?.enabled === false || user?.settings?.notifications?.sound === false) {
    return;
  }
  const sound = document.getElementById('new-message-sound');
  // Spela bara ljud om användaren har interagerat med sidan först
  sound.play().catch(error => {
    // Fånga felet som kan uppstå om användaren inte interagerat med sidan än.
    // Detta är en säkerhetsfunktion i webbläsare.
    console.log("Kunde inte spela ljud:", error);
  });
}

let currentMessageType = 'message'; // Startvärde
let typingTimeout;

async function sendMessage(threadId = null, textOverride = null, typeOverride = null, callback = null) { // Lade till callback
  let text = '';
  let inputFieldToClear = null;

  if (textOverride) {
    text = textOverride;
  } else {
    inputFieldToClear = document.querySelector('#chat-view .input-area input');
    text = inputFieldToClear.value.trim();
  }
  if (text === '') return;

  // NYTT: Säkerhetskontroll. Går inte att skicka om man inte är medlem i kanalen.
  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel || !currentChannel.members.includes(currentUserId)) {
    console.warn("Försök att skicka meddelande i en kanal man inte är medlem i. Avbryter.");
    return;
  }

  const newMessage = {
    // ID genereras av Firestore
    text: text,
    type: typeOverride || currentMessageType,
    claimedBy: null,
    completed: false,
    userId: currentUserId,
    timestamp: new Date().toISOString(),
    channelId: currentChannelId, // Viktigt för att kunna fråga databasen
    reactions: {},
    threadId: threadId, // Sätt threadId om det är ett svar
    editedTimestamp: null
  };

  // STEG 1 för checklistor: Omvandla text till en checklista-struktur.
  if (newMessage.type === 'checklist') {
    // KORRIGERING: Hela texten blir rubriken. Listan startar tom.
    newMessage.title = text;
    newMessage.items = [];
    delete newMessage.text;
  }

  try {
    const docRef = await db.collection('messages').add(newMessage);
    console.log("Meddelande skickat med ID:", docRef.id);
    const newMsgWithId = { ...newMessage, id: docRef.id };

    // Lägg till/uppdatera meddelandet i det lokala statet utan att skapa dubbletter.
    upsertMessageToState(currentChannelId, newMsgWithId);

    // NYTT: Om en callback finns, anropa den med det nya meddelandet
    if (callback) {
      callback(newMsgWithId);
    }
    // Realtidslyssnaren i state.js kommer att uppdatera UI.
  } catch (error) {
    console.error("Fel vid skickande av meddelande:", error);
    showDialog({
      title: 'Fel',
      message: 'Kunde inte skicka meddelandet. Försök igen.',
      buttons: [{ text: 'OK', class: 'primary' }]
    });
  }

  clearTimeout(typingTimeout);
  hideTypingIndicator();
  if (inputFieldToClear) {
    inputFieldToClear.value = '';
    document.querySelector('#chat-view .send-btn').classList.add('hidden');
  }
  await updateLastSeen();
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

/**
 * NYTT: Växlar 'completed'-status för en specifik punkt i en checklista.
 * @param {string} msgId - ID för meddelandet.
 * @param {number} itemIndex - Index för checklist-punkten.
 */
function toggleChecklistItem(msgId, itemIndex) {
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  if (!msg || msg.type !== 'checklist' || !msg.items[itemIndex]) {
    console.error("Kunde inte hitta checklist-punkt att uppdatera.");
    return;
  }

  // Skapa en kopia och växla status
  const newItems = JSON.parse(JSON.stringify(msg.items));
  newItems[itemIndex].completed = !newItems[itemIndex].completed;

  // Uppdatera hela 'items'-arrayen i Firestore
  db.collection('messages').doc(msg.id).update({
    items: newItems
  }).catch(error => console.error("Fel vid uppdatering av checklista:", error));
}

/**
 * NYTT: Lägger till en ny punkt i en befintlig checklista.
 * @param {string} msgId - ID för meddelandet.
 * @param {string} itemText - Texten för den nya punkten.
 */
function addChecklistItem(msgId, itemText) {
  if (!itemText) return;

  const newItem = { text: itemText, completed: false };

  db.collection('messages').doc(msgId).update({
    items: firebase.firestore.FieldValue.arrayUnion(newItem)
  }).catch(error => console.error("Kunde inte lägga till punkt i checklista:", error));
}

/**
 * NYTT: Raderar en specifik punkt från en checklista.
 * @param {string} msgId - ID för meddelandet.
 * @param {number} itemIndex - Index för checklist-punkten som ska raderas.
 */
function deleteChecklistItem(msgId, itemIndex) {
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  if (!msg || msg.type !== 'checklist' || !msg.items[itemIndex]) {
    console.error("Kunde inte hitta checklist-punkt att radera.");
    return;
  }

  // Skapa en ny array utan den borttagna punkten
  const newItems = msg.items.filter((_, index) => index !== itemIndex);

  // Uppdatera hela 'items'-arrayen i Firestore
  db.collection('messages').doc(msg.id).update({
    items: newItems
  }).catch(error => console.error("Fel vid radering av checklist-punkt:", error));
}

/**
 * NYTT: Ändrar ordningen på punkter i en checklista.
 * @param {string} msgId - ID för meddelandet.
 * @param {number} oldIndex - Punktens ursprungliga index.
 * @param {number} newIndex - Punktens nya index.
 */
function reorderChecklistItems(msgId, oldIndex, newIndex) {
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  if (!msg || msg.type !== 'checklist') {
    return;
  }

  // Skapa en ny, omordnad array
  const newItems = Array.from(msg.items);
  const [movedItem] = newItems.splice(oldIndex, 1);
  newItems.splice(newIndex, 0, movedItem);

  // Uppdatera hela 'items'-arrayen i Firestore
  db.collection('messages').doc(msg.id).update({
    items: newItems
  }).catch(error => console.error("Fel vid omordning av checklista:", error));
}

/**
 * NYTT: Tar på sig en uppgift och skapar ett systemmeddelande.
 * @param {string} msgId - ID för uppgiftsmeddelandet.
 */
async function claimTask(msgId) {
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  if (!msg || msg.claimedBy) return; // Ta inte på dig en redan tagen uppgift

  const systemMessage = {
    type: 'system',
    actorId: currentUserId,
    text: `har tagit sig an uppgiften: "${msg.text}"`,
    timestamp: new Date().toISOString(),
    channelId: currentChannelId
  };

  const batch = db.batch();

  // Uppdatera uppgiftsmeddelandet
  const msgRef = db.collection('messages').doc(msgId);
  batch.update(msgRef, { claimedBy: currentUserId });

  // Lägg till systemmeddelandet
  const systemMsgRef = db.collection('messages').doc(); // Nytt dokument
  batch.set(systemMsgRef, systemMessage);

  try {
    await batch.commit();
    console.log("Uppgift tagen och systemmeddelande skickat.");
  } catch (error) {
    console.error("Fel vid tagande av uppgift:", error);
  }
}

/**
 * NYTT: Slutför en uppgift som användaren har tagit på sig.
 * @param {string} msgId - ID för uppgiftsmeddelandet.
 */
async function completeTask(msgId) {
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  // Endast den som tagit uppgiften kan slutföra den.
  if (!msg || msg.completed || msg.claimedBy !== currentUserId) return;

  const systemMessage = {
    type: 'system',
    actorId: currentUserId,
    text: `har slutfört uppgiften: "${msg.text}"`,
    timestamp: new Date().toISOString(),
    channelId: currentChannelId
  };

  const batch = db.batch();

  // Uppdatera uppgiftsmeddelandet
  const msgRef = db.collection('messages').doc(msgId);
  batch.update(msgRef, { completed: true });

  // Lägg till systemmeddelandet
  const systemMsgRef = db.collection('messages').doc(); // Nytt dokument
  batch.set(systemMsgRef, systemMessage);

  try {
    await batch.commit();
    console.log("Uppgift slutförd och systemmeddelande skickat.");
  } catch (error) {
    console.error("Fel vid slutförande av uppgift:", error);
  }
}

function toggleReaction(msgIndex, emoji) {
  const msg = allMessages[currentChannelId][msgIndex];
  if (!msg || !msg.id) {
    console.error("Kan inte hitta meddelande-ID för att reagera.");
    return;
  }

  // Skapa en djup kopia för att undvika att mutera state direkt
  const newReactions = JSON.parse(JSON.stringify(msg.reactions || {}));

  if (!newReactions[emoji]) {
    msg.reactions[emoji] = [];
  }

  const reactedUsers = msg.reactions[emoji];
  const userIndex = reactedUsers.indexOf(currentUserId);

  if (userIndex > -1) {
    reactedUsers.splice(userIndex, 1);
    if (reactedUsers.length === 0) delete msg.reactions[emoji];
  } else {
    reactedUsers.push(currentUserId);
  }

  db.collection('messages').doc(msg.id).update({ reactions: msg.reactions })
    .then(() => console.log("Reaktion uppdaterad"))
    .catch(error => console.error("Fel vid uppdatering av reaktion:", error));
  
  updateLastSeen();
}

function togglePinMessage(msgId) {
  const channel = allChannels[currentChannelId];
  if (!channel) return;

  const currentPinnedIds = channel.pinnedMessageIds || [];
  let newPinnedIds;

  if (currentPinnedIds.includes(msgId)) {
    // Ta bort ID från listan
    newPinnedIds = currentPinnedIds.filter(id => id !== msgId);
  } else {
    // Lägg till ID i listan
    newPinnedIds = [...currentPinnedIds, msgId];
  }

  db.collection('channels').doc(currentChannelId).update({
    pinnedMessageIds: newPinnedIds
  })
  .then(() => {
    console.log("Fästa meddelanden uppdaterade.");
  })
  .catch(error => console.error("Fel vid uppdatering av fästa meddelanden:", error));
}

function editMessage(msgIndex, newText, isInThreadView = false) {
  const messages = allMessages[currentChannelId];
  const msg = messages[msgIndex];

  // Kontrollera att det är rätt användare och att texten faktiskt ändrats.
  if (msg && msg.id && msg.userId === currentUserId && msg.text !== newText) {
    msg.text = newText;
    msg.editedTimestamp = new Date().toISOString();
    
    db.collection('messages').doc(msg.id).update({
      text: newText,
      editedTimestamp: msg.editedTimestamp
    }).then(() => {
      console.log("Meddelande redigerat");
      // UI uppdateras av realtidslyssnaren
    }).catch(error => console.error("Fel vid redigering:", error));

    // Uppdatera bara det specifika meddelandet i DOM:en för en smidigare upplevelse.
    const activeView = isInThreadView ? document.getElementById('thread-view-container') : document.getElementById('chat-view');
    const messageElement = activeView.querySelector(`.message-container[data-msg-index="${msgIndex}"]`);

    if (messageElement) {
      const context = isInThreadView ? 'thread' : 'chat';
      messageElement.replaceWith(createMessageElement(msg, msgIndex, context));
    }
  }
}

function toggleMuteChannel(channelId) {
  if (!currentUser) return;
  const currentMuted = currentUser.mutedChannels || [];

  const index = currentMuted.indexOf(channelId);
  if (index > -1) {
    // Unmute
    db.collection('users').doc(currentUserId).update({
      mutedChannels: firebase.firestore.FieldValue.arrayRemove(channelId)
    });
  } else {
    // Mute
    db.collection('users').doc(currentUserId).update({
      mutedChannels: firebase.firestore.FieldValue.arrayUnion(channelId)
    });
  }
  // UI uppdateras av realtidslyssnaren
}

function saveStatus() {
  const statusInput = document.getElementById('status-message-input');
  if (!statusInput || !currentUserId) return;
  const newStatus = statusInput.value.trim();
  
  db.collection('users').doc(currentUserId).update({ statusMessage: newStatus })
    .catch(error => console.error("Kunde inte spara status:", error));
}

function changeAvatar(url) {
  if (!currentUserId) return;
  const trimmedUrl = url.trim();
  db.collection('users').doc(currentUserId).update({ avatarUrl: trimmedUrl })
    .catch(error => console.error("Kunde inte ändra avatar:", error));
}

function startDirectMessage(otherUserId) {
  if (!currentUserId || !otherUserId) return;
  const dmChannelId = [currentUserId, otherUserId].sort().join('_dm_');

  // Om kanalen redan finns, byt bara vy.
  if (allChannels[dmChannelId]) {
    switchView('chat-view', { channelId: dmChannelId });
    return;
  }

  // Om kanalen inte finns, skapa den.
  const newDMChannel = {
    name: `DM med ${allUsers[otherUserId].name}`,
    isPublic: false,
    isDM: true,
    members: [currentUserId, otherUserId],
    createdBy: currentUserId,
    createdAt: new Date().toISOString()
  };

  const batch = db.batch();

  const channelRef = db.collection('channels').doc(dmChannelId);
  batch.set(channelRef, newDMChannel);

  const currentUserRef = db.collection('users').doc(currentUserId);
  batch.update(currentUserRef, { channels: firebase.firestore.FieldValue.arrayUnion(dmChannelId) });

  const otherUserRef = db.collection('users').doc(otherUserId);
  batch.update(otherUserRef, { channels: firebase.firestore.FieldValue.arrayUnion(dmChannelId) });

  batch.commit().then(() => {
    switchView('chat-view', { channelId: dmChannelId });
  }).catch(error => console.error("Kunde inte starta DM:", error));
}

async function inviteUserToChannel(userId) {
  const invitedUser = allUsers[userId];
  if (!invitedUser || !currentChannelId) return;

  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      pendingInvites: firebase.firestore.FieldValue.arrayUnion({
        channelId: currentChannelId,
        invitedBy: currentUserId
      })
    });

    showDialog({
      title: 'Inbjudan skickad',
      message: `${invitedUser.name} har bjudits in till kanalen.`,
      buttons: [{ text: 'OK', class: 'primary' }]
    });
    closeInviteModal();
  } catch (error) {
    console.error('Fel vid skickande av inbjudan:', error);
  }
}

async function acceptInvitation(channelId) {
  const user = currentUser;
  if (!user) return;

  const invite = user.pendingInvites?.find(inv => inv.channelId === channelId);
  if (!invite) return;

  const batch = db.batch();
  const userRef = db.collection('users').doc(currentUserId);

  batch.update(userRef, {
    pendingInvites: firebase.firestore.FieldValue.arrayRemove(invite),
    channels: firebase.firestore.FieldValue.arrayUnion(channelId)
  });

  const channelRef = db.collection('channels').doc(channelId);
  batch.update(channelRef, {
    members: firebase.firestore.FieldValue.arrayUnion(currentUserId)
  });

  const joinMessage = {
    type: 'system',
    text: 'har gått med i kanalen.',
    actorId: currentUserId,
    timestamp: new Date().toISOString(),
    channelId: channelId
  };
  batch.set(db.collection('messages').doc(), joinMessage);

  try {
    await batch.commit();
    // Realtidslyssnarna kommer att uppdatera UI. Vi byter bara vy.
    switchView('chat-view', { channelId });
  } catch (error) {
    console.error('Kunde inte acceptera inbjudan:', error);
  }
}

async function declineInvitation(channelId) {
  const invite = currentUser?.pendingInvites?.find(inv => inv.channelId === channelId);
  if (!invite) return;

  try {
    const userRef = db.collection('users').doc(currentUserId);
    await userRef.update({
      pendingInvites: firebase.firestore.FieldValue.arrayRemove(invite)
    });
    // Realtidslyssnaren uppdaterar UI automatiskt.
  } catch (error) {
    console.error('Kunde inte tacka nej till inbjudan:', error);
  }
}

function leaveCurrentChannel() {
  const channelName = allChannels[currentChannelId]?.name || 'denna kanal';

  showDialog({
    title: 'Lämna kanal',
    message: `Är du säker på att du vill lämna kanalen "${channelName}"?`,
    buttons: [
      { text: 'Avbryt', class: 'secondary' },
      { text: 'Lämna', class: 'danger', onClick: () => {
          const channelIdToLeave = currentChannelId;
          const leaveMessage = {
            type: 'system',
            text: 'har lämnat kanalen.',
            actorId: currentUserId,
            timestamp: new Date().toISOString(),
            channelId: channelIdToLeave
          };

          const batch = db.batch();
          batch.update(db.collection('users').doc(currentUserId), { channels: firebase.firestore.FieldValue.arrayRemove(channelIdToLeave) });
          batch.update(db.collection('channels').doc(channelIdToLeave), { members: firebase.firestore.FieldValue.arrayRemove(currentUserId) });
          batch.set(db.collection('messages').doc(), leaveMessage);

          batch.commit().then(() => {
            currentChannelId = null;
            localStorage.removeItem('currentChannelId');
            switchView('home-view');
          }).catch(error => console.error("Kunde inte lämna kanal:", error));
        }}
    ]
  });
}

async function deleteMessagesForChannel(channelId) {
  const messagesSnapshot = await db.collection('messages').where('channelId', '==', channelId).get();
  if (messagesSnapshot.empty) return;

  const deleteBatches = [];
  let batch = db.batch();
  let operationCount = 0;

  messagesSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
    operationCount += 1;

    if (operationCount === 500) {
      deleteBatches.push(batch);
      batch = db.batch();
      operationCount = 0;
    }
  });

  if (operationCount > 0) {
    deleteBatches.push(batch);
  }

  for (const deleteBatch of deleteBatches) {
    await deleteBatch.commit();
  }
}

async function deleteCurrentChannel() {
  const channel = allChannels[currentChannelId];
  if (!channel || !currentUserId) return;

  const channelName = channel.name || 'denna kanal';

  showDialog({
    title: 'Radera kanal',
    message: `Är du säker på att du vill radera "${channelName}"? Alla meddelanden kommer att tas bort permanent. Detta kan inte ångras.`,
    buttons: [
      { text: 'Avbryt', class: 'secondary' },
      { text: 'Radera kanal', class: 'danger', onClick: async () => {
        try {
          await deleteMessagesForChannel(currentChannelId);

          const batch = db.batch();
          const channelRef = db.collection('channels').doc(currentChannelId);
          const userRef = db.collection('users').doc(currentUserId);

          batch.delete(channelRef);
          batch.update(userRef, { channels: firebase.firestore.FieldValue.arrayRemove(currentChannelId) });

          await batch.commit();

          currentChannelId = null;
          localStorage.removeItem('currentChannelId');
          switchView('home-view');
        } catch (error) {
          console.error('Kunde inte radera kanal:', error);
          showDialog({
            title: 'Fel vid radering',
            message: 'Kunde inte radera kanalen. Kontrollera att du är ägare och att reglerna tillåter borttagning.',
            buttons: [{ text: 'OK', class: 'primary' }]
          });
        }
      }}
    ]
  });
}

/**
 * NYTT: Uppdaterar användarens skrivstatus i den aktuella kanalen i Firestore.
 * @param {boolean} isTyping - True om användaren skriver, false om de slutat.
 */
function updateTypingStatus(isTyping) {
  if (!currentUserId || !currentChannelId) return;

  const channelRef = db.collection('channels').doc(currentChannelId);
  const typingUpdate = {};

  if (isTyping) {
    // Använd punktnotation för att lägga till/uppdatera användarens ID i 'typingUsers'-mappen.
    // Värdet kan vara en timestamp, men för enkelhetens skull räcker true.
    typingUpdate[`typingUsers.${currentUserId}`] = true;
  } else {
    // Använd FieldValue.delete() för att ta bort användarens ID från mappen.
    typingUpdate[`typingUsers.${currentUserId}`] = firebase.firestore.FieldValue.delete();
  }

  // Uppdatera kanaldokumentet utan att skriva över annan data.
  channelRef.update(typingUpdate).catch(error => console.error("Kunde inte uppdatera skrivstatus:", error));
}

function switchView(viewId, data) {
  // NYTT: När vi byter vy, koppla bort den gamla observatören för läskvitton.
  if (window.readReceiptObserver) {
    window.readReceiptObserver.disconnect();
  }

  document.querySelectorAll('.view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active-view');
  });
  
  // NYTT: Rensa currentProfileUserId när vi navigerar bort från profilvyn
  if (viewId !== 'profile-view') {
    currentProfileUserId = null;
  }
  
  const activeView = document.getElementById(viewId);
  activeView?.classList.remove('hidden');
  activeView?.classList.add('active-view');
  updateLastSeen();

  if (viewId === 'chat-view' && data && data.channelId) {
    currentChannelId = data.channelId;
    localStorage.setItem('currentChannelId', currentChannelId); // Behåll denna för sidomladdning (OK för nu)
  }
  
  // NYTT: Spara userId när vi visar en profilvy
  if (viewId === 'profile-view' && data) {
    currentProfileUserId = data;
    renderProfileView(data);
  }
  
  // Spara den aktiva vyn så att vi kan återvända hit nästa gång.
  localStorage.setItem('lastActiveView', viewId); // Behåll denna för sidomladdning (OK för nu)

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navButton = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if(navButton) navButton.classList.add('active');
  
  updateHeader(viewId, data);
}

// --- NYTT: Funktioner för att hantera trådvy ---

function openThreadView(parentMsgId) {
  const threadViewContainer = document.getElementById('thread-view-container');
  renderThreadView(parentMsgId); // Bygg upp vyn
  threadViewContainer.classList.remove('hidden'); // Visa vyn

  // NYTT: Koppla händelselyssnare till den nyskapade trådvyn.
  attachMessageViewEvents(threadViewContainer);
}

function closeThreadView() {
  const threadViewContainer = document.getElementById('thread-view-container');
  threadViewContainer.classList.add('hidden');
  // Rensa innehållet för att undvika gamla data nästa gång
  threadViewContainer.innerHTML = '';
}

/**
 * Dynamiskt "cache-busting" för att alltid ladda om ikonerna vid ny session.
 * Detta förhindrar att webbläsaren använder en gammal, cachad version av ikonfilen.
 */
function loadIcons() {
  document.querySelectorAll('use').forEach(use => {
    const iconId = use.href.baseVal.split('#')[1];
    if (iconId) {
      use.setAttribute('href', `icons.svg?v=${Date.now()}#${iconId}`);
    }
  });
}

// Initiera appen
function initApp() {
  // Be om lov att visa notiser när appen startar.
  requestNotificationPermission();
  loadIcons();

  // NYTT: Registrera Service Worker för PWA-funktionalitet.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('ServiceWorker-registrering lyckades med scope: ', registration.scope);
        })
        .catch(err => {
          console.log('ServiceWorker-registrering misslyckades: ', err);
        });
    });
  }

  // NYTT: Lägg till händelselyssnare för att automatiskt uppdatera "senast sedd".
  // Detta gör statusen mycket mer exakt.
  document.addEventListener('visibilitychange', () => {
    // Uppdatera när användaren byter tillbaka till fliken.
    if (document.visibilityState === 'visible') {
      updateLastSeen();
    }
  });
  window.addEventListener('focus', () => {
    updateLastSeen(); // Uppdatera när fönstret får fokus.
  });

  // NYTT: Återställ den senaste vyn från localStorage istället för att alltid starta på hem.
  const lastView = localStorage.getItem('lastActiveView') || 'home-view';
  const lastChannel = localStorage.getItem('currentChannelId');

  let viewData = null;
  if (lastView === 'chat-view' && lastChannel) {
    viewData = { channelId: lastChannel };
  } else if (lastView === 'profile-view') {
    // Vi kan inte veta vilken profil som visades, så vi visar användarens egen.
    viewData = currentUserId;
  }

  switchView(lastView, viewData);
  updateLastSeen();

  setInterval(() => {
    if (document.getElementById('profile-view').classList.contains('active-view')) {
      // NYTT: Använd currentProfileUserId om det finns (annan användare), annars currentUserId (egen profil)
      renderProfileView(currentProfileUserId || currentUserId);
    }
  }, 60 * 1000);
}

/**
 * Tvingar en omsynkronisering av den aktiva vyn med det nuvarande state.
 * Denna funktion anropas av Firestore-lyssnarna i state.js när data ändras.
 */
function syncAndRerenderAllViews() {
  const activeView = document.querySelector('.view.active-view');
  if (!activeView) return;

  // Anropa den specifika render-funktionen för den aktiva vyn
  // för att uppdatera dess innehåll utan att byta vy.
  switch (activeView.id) {
    case 'home-view':
      renderHomeView();
      break;
    case 'profile-view':
      // NYTT: Använd sparad userId om det finns, annars använd currentUserId
      renderProfileView(currentProfileUserId || currentUserId);
      break;
    case 'chat-view':
      renderMessages();
      break;
  }
  updateHeader(activeView.id); // Uppdatera alltid headern också
}