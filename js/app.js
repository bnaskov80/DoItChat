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
  if (!("Notification" in window)) {
    return; // Webbläsaren stöder inte notiser.
  }

  // Visa bara notis om vi har tillåtelse och om användaren inte redan tittar på fliken.
  if (Notification.permission === "granted" && document.hidden) {
    new Notification(title, options);
  }
}

function playNewMessageSound() {
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

function sendMessage(threadId = null, textOverride = null) {
  let text = '';
  let inputFieldToClear = null;

  if (textOverride !== null) {
    text = textOverride;
  } else {
    inputFieldToClear = document.querySelector('#chat-view .input-area input');
    text = inputFieldToClear.value.trim();
  }
  if (text === '') return;

  const messages = allMessages[currentChannelId] || [];
  const newMessage = {
    id: `msg_${Date.now()}_${Math.random()}`, // Unikt ID för varje meddelande
    text: text,
    type: currentMessageType,
    claimedBy: null,
    completed: false,
    userId: currentUserId,
    timestamp: new Date().toISOString(),
    reactions: {},
    threadId: threadId, // Sätt threadId om det är ett svar
    editedTimestamp: null
  };
  messages.push(newMessage);
  allMessages[currentChannelId] = messages;
  saveMessages();

  // FIX: Use createMessageElement instead of renderSingleMessage
  const messageElement = createMessageElement(newMessage, messages.length - 1);
  if (messageElement) {
    chatFeed.appendChild(messageElement);
  }

  const lastMessage = chatFeed.lastElementChild;
  if (lastMessage) {
    lastMessage.classList.add('new-message-anim');
  }

  clearTimeout(typingTimeout);
  hideTypingIndicator();
  if (inputFieldToClear) {
    inputFieldToClear.value = '';
    document.querySelector('#chat-view .send-btn').classList.add('hidden');
  }
  updateLastSeen();
  // Rensa tråd-ID från skicka-knappen efter att meddelandet har skickats
  const sendBtn = document.querySelector('.send-btn');
  sendBtn.removeAttribute('data-thread-id');
  sendBtn.classList.remove('replying'); // Ta bort visuell indikator
  document.querySelector('.send-btn').classList.add('hidden');
  chatFeed.scrollTop = chatFeed.scrollHeight;

  simulateBotTyping();
}


function toggleReaction(msgIndex, emoji) {
  const messages = allMessages[currentChannelId];
  const msg = messages[msgIndex];

  if (!msg.reactions[emoji]) {
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

  saveMessages();

  // FIX: Uppdatera bara reaktionerna i DOM:en istället för att rita om hela meddelandet.
  const messageElement = document.querySelector(`.message-container[data-msg-index="${msgIndex}"]`);
  if (messageElement) {
    const footer = messageElement.querySelector('.message-footer');
    if (footer) {
      const newReactionsHTML = renderReactions(msg, msgIndex);
      const reactionsContainer = footer.querySelector('.reactions-container');
      if (reactionsContainer) {
        if (newReactionsHTML) {
          reactionsContainer.outerHTML = newReactionsHTML;
        } else {
          reactionsContainer.remove();
        }
      } else if (newReactionsHTML) {
        // Om det inte fanns några reaktioner innan, lägg till behållaren.
        const addReactionBtn = footer.querySelector('.add-reaction-btn');
        addReactionBtn.insertAdjacentHTML('beforebegin', newReactionsHTML);
      }
    }
  }

  updateLastSeen();
}

function togglePinMessage(msgIndex) {
  const channel = allChannels[currentChannelId];
  if (!channel.pinnedMessageIndices) {
    channel.pinnedMessageIndices = [];
  }
  
  const existingPinIndex = channel.pinnedMessageIndices.indexOf(msgIndex);

  if (existingPinIndex > -1) {
    // Meddelandet är redan fäst, så ta bort det från listan.
    channel.pinnedMessageIndices.splice(existingPinIndex, 1);
  } else {
    // Annars, lägg till det i listan.
    channel.pinnedMessageIndices.push(msgIndex);
  }
  saveChannels();
  renderMessages(); // Rita om hela vyn för att visa/dölja bannern och uppdatera ikoner
}

function editMessage(msgIndex, newText) {
  const messages = allMessages[currentChannelId];
  const msg = messages[msgIndex];

  // Kontrollera att det är rätt användare och att texten faktiskt ändrats.
  if (msg.userId === currentUserId && msg.text !== newText) {
    msg.text = newText;
    msg.editedTimestamp = new Date().toISOString();
    saveMessages();

    // Uppdatera bara det specifika meddelandet i DOM:en för en smidigare upplevelse.
    const messageElement = document.querySelector(`.message-container[data-msg-index="${msgIndex}"]`);
    if (messageElement) {
      messageElement.replaceWith(createMessageElement(msg, msgIndex));
    }
  }
}

function toggleMuteChannel(channelId) {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  if (!user.mutedChannels) {
    user.mutedChannels = [];
  }

  const index = user.mutedChannels.indexOf(channelId);
  if (index > -1) {
    // Unmute
    user.mutedChannels.splice(index, 1);
  } else {
    // Mute
    user.mutedChannels.push(channelId);
  }

  saveCurrentUser(user);
  // Rita om vyer som påverkas av ändringen
  renderHomeView();
  updateHeader('chat-view');
}

function simulateBotTyping() {
  if (Math.random() < 0.2) {
    setTimeout(() => {
      showTypingIndicator('Kollegabot');
      setTimeout(() => {
        hideTypingIndicator();
      }, 2000 + Math.random() * 3000);
    }, 1000);
  }
}

function saveStatus() {
  const statusInput = document.getElementById('status-message-input');
  if (!statusInput) return;
  const newStatus = statusInput.value.trim();
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.statusMessage = newStatus;
  saveCurrentUser(user);
  renderProfileView();
}

function changeAvatar(url) {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.avatarUrl = url.trim();
  saveCurrentUser(user);

  // Uppdatera även i den globala användarlistan
  allUsers[user.id].avatarUrl = user.avatarUrl;
  saveAllUsers();

  renderProfileView(user); // Rita om profilen för att visa den nya bilden

  // FIX: Se till att alla andra vyer och headers också uppdateras med den nya bilden.
  syncAndRerenderAllViews();
}

function startDirectMessage(otherUserId) {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  const dmChannelId = [user.id, otherUserId].sort().join('_dm_');

  if (!allChannels[dmChannelId]) {
    allChannels[dmChannelId] = {
      name: `DM med ${allUsers[otherUserId].name}`,
      isPublic: false,
      isDM: true,
      members: [user.id, otherUserId]
    };

    if (!allMessages[dmChannelId]) allMessages[dmChannelId] = [];

    if (!user.channels.includes(dmChannelId)) user.channels.push(dmChannelId);
    
    const otherUser = allUsers[otherUserId];
    if (!otherUser.channels) otherUser.channels = [];
    if (!otherUser.channels.includes(dmChannelId)) otherUser.channels.push(dmChannelId);

    saveCurrentUser(user);
    saveAllUsers();
    saveChannels();
    saveMessages();
  }

  switchView('chat-view', { channelId: dmChannelId });
}

function inviteUserToChannel(userId) {
  allChannels[currentChannelId].members.push(userId);

  // Lägg till kanalen i den inbjudna användarens kanallista
  const invitedUser = allUsers[userId];
  if (invitedUser) {
    if (!invitedUser.channels) invitedUser.channels = [];
    if (!invitedUser.channels.includes(currentChannelId)) {
      invitedUser.channels.push(currentChannelId);
    }
    saveAllUsers();
  }

  // Skapa ett systemmeddelande om att användaren har bjudits in
  const inviteMessage = {
    type: 'system',
    text: `har bjudit in ${invitedUser.name} till kanalen.`,
    actorId: currentUserId,
    timestamp: new Date()
  };
  allMessages[currentChannelId].push(inviteMessage);
  saveMessages();
  saveChannels();
  renderMessages();
  closeInviteModal();
}

function leaveCurrentChannel() {
  const channelName = allChannels[currentChannelId]?.name || 'denna kanal';
  if (confirm(`Är du säker på att du vill lämna ${channelName}?`)) {
    const channelIdToLeave = currentChannelId; // Spara IDt innan vi nollställer det
    const user = JSON.parse(localStorage.getItem('currentUser'));

    // Skapa ett systemmeddelande om att användaren har lämnat
    const leaveMessage = {
      type: 'system',
      text: 'har lämnat kanalen.',
      actorId: currentUserId,
      timestamp: new Date()
    };
    allMessages[channelIdToLeave].push(leaveMessage);
    saveMessages();

    // Ta bort kanalen från användarens lista
    user.channels = user.channels.filter(chId => chId !== channelIdToLeave);
    saveCurrentUser(user);

    // Ta bort användaren från kanalens medlemslista
    const channel = allChannels[channelIdToLeave];
    if (channel && channel.members) {
      channel.members = channel.members.filter(memberId => memberId !== currentUserId);
      saveChannels();
    }

    currentChannelId = null;
    localStorage.removeItem('currentChannelId');
    switchView('home-view');
  }
}

function switchView(viewId, data) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active-view');
  });
  const activeView = document.getElementById(viewId);
  activeView?.classList.remove('hidden');
  activeView?.classList.add('active-view');
  updateLastSeen();

  if (viewId === 'chat-view' && data && data.channelId) {
    currentChannelId = data.channelId;
    localStorage.setItem('currentChannelId', currentChannelId);
  }
  
  // Spara den aktiva vyn så att vi kan återvända hit nästa gång.
  localStorage.setItem('lastActiveView', viewId);

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navButton = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if(navButton) navButton.classList.add('active');
  
  updateHeader(viewId, data);
}

function syncAndRerenderAllViews() {
  // Uppdatera den aktiva vyn
  const activeView = document.querySelector('.view.active-view');
  if (activeView) {
    // Anropa switchView på den nuvarande vyn för att tvinga en fullständig omritning
    // av både innehåll och header.
    switchView(activeView.id);
  }
}

// --- NYTT: Funktioner för att hantera trådvy ---

function openThreadView(parentMsgId) {
  const threadViewContainer = document.getElementById('thread-view-container');
  renderThreadView(parentMsgId); // Bygg upp vyn
  threadViewContainer.classList.remove('hidden'); // Visa vyn
}

function closeThreadView() {
  const threadViewContainer = document.getElementById('thread-view-container');
  threadViewContainer.classList.add('hidden');
  // Rensa innehållet för att undvika gamla data nästa gång
  threadViewContainer.innerHTML = '';
}

// Initiera appen
function initApp() {
  // Be om lov att visa notiser när appen startar.
  requestNotificationPermission();

  renderTypeSelectorDropdown();

  // Starta alltid på hemvyn
  switchView('home-view');
  updateLastSeen();

  setInterval(() => {
    if (document.getElementById('profile-view').classList.contains('active-view')) {
      renderProfileView(currentUserId);
    }
  }, 60 * 1000);
}

initApp();