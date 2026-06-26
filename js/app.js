// =================================================================
// APP.JS
// Initiering, controll-logik och funktioner som binder samman
// state, UI och events.
// =================================================================

let currentMessageType = 'message'; // Startvärde
let typingTimeout;

function sendMessage() {
  const inputField = document.querySelector('.input-area input');
  const text = inputField.value.trim();
  if (text === '') return;

  const messages = allMessages[currentChannelId] || [];
  const newMessage = {
    text: text,
    type: currentMessageType,
    claimedBy: null,
    completed: false,
    userId: currentUserId,
    timestamp: new Date(),
    reactions: {}
  };
  messages.push(newMessage);
  allMessages[currentChannelId] = messages;
  saveMessages();

  renderSingleMessage(newMessage, messages.length - 1);

  const lastMessage = chatFeed.lastElementChild;
  if (lastMessage) {
    lastMessage.classList.add('new-message-anim');
  }

  clearTimeout(typingTimeout);
  hideTypingIndicator();
  inputField.value = '';
  updateLastSeen();
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

  // Hitta meddelande-elementet i DOM
  const chatFeed = document.querySelector('.chat-feed');
  const messageElement = chatFeed.children[msgIndex];

  if (messageElement) {
    // Skapa det uppdaterade HTML-elementet för meddelandet
    const updatedMessageElement = createMessageElement(msg, msgIndex);
    // Ersätt det gamla elementet med det nya
    messageElement.replaceWith(updatedMessageElement);
  }

  updateLastSeen();
}

function togglePinMessage(msgIndex) {
  const channel = allChannels[currentChannelId];
  
  // Om detta meddelande redan är fäst, lossa det.
  if (channel.pinnedMessageIndex === msgIndex) {
    channel.pinnedMessageIndex = null;
  } else {
    // Annars, fäst det.
    channel.pinnedMessageIndex = msgIndex;
  }
  saveChannels();
  renderMessages(); // Rita om hela vyn för att visa ändringen
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

// Initiera appen
function initApp() {
  renderTypeSelectorDropdown();

  // Återställ den senaste vyn användaren var på.
  const lastView = localStorage.getItem('lastActiveView');
  // Om senaste vyn var chatten, men ingen kanal är vald, gå till hemvyn istället.
  if (lastView === 'chat-view' && !currentChannelId) {
    switchView('home-view');
  } else if (lastView) {
    // Profilvyn behöver användar-ID för att renderas korrekt.
    const data = lastView === 'profile-view' ? currentUserId : null;
    switchView(lastView, data);
  } else {
    // Standard är hemvyn om inget annat sparats.
    switchView('home-view');
  }

  updateLastSeen();

  setInterval(() => {
    if (document.getElementById('profile-view').classList.contains('active-view')) {
      renderProfileView(currentUserId);
    }
  }, 60 * 1000);
}

initApp();