// =================================================================
// EVENTS.JS
// Innehåller alla händelselyssnare (event listeners).
// =================================================================

const sendBtn = document.querySelector('.send-btn');
const inputField = document.querySelector('.input-area input');
const typeSelectorBtn = document.getElementById('type-selector-btn');

// --- Input-fält och skicka-knapp ---

inputField.addEventListener('input', function() {
  sendBtn.classList.toggle('hidden', inputField.value.trim().length === 0);
});

sendBtn.addEventListener('click', sendMessage);

inputField.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') sendMessage();
});

// --- Meddelandetyp-väljare ---

typeSelectorBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  typeSelectorDropdown.classList.toggle('hidden');
});

// --- Chattflöde (delegerad eventhantering) ---

chatFeed.addEventListener('click', function(event) {
  // "Jag tar denna"-knapp
  const taskBtn = event.target.closest('.task-btn');
  if (taskBtn) {
    const taskBox = event.target.closest('.task-message');
    const index = taskBox.getAttribute('data-index');
    taskBox.classList.add('claimed-anim');

    setTimeout(() => {
      const messages = allMessages[currentChannelId];
      messages[index].claimedBy = currentUserId;
      messages.push({
        type: 'system',
        actorId: currentUserId,
        text: `har tagit sig an uppgiften: "${messages[index].text}"`,
        timestamp: new Date()
      });
      saveMessages();
      renderMessages();
      renderProfileView(currentUserId);
    }, 400);
    return;
  }

  // "Markera som klar"-knapp
  const completeBtn = event.target.closest('.complete-task-btn');
  if (completeBtn) {
    const index = completeBtn.getAttribute('data-index');
    const messages = allMessages[currentChannelId];
    messages[index].completed = true;
    messages.push({
      type: 'system',
      actorId: currentUserId,
      text: `har slutfört uppgiften: "${messages[index].text}"`,
      timestamp: new Date()
    });
    saveMessages();
    renderMessages();
    return;
  }

  // Klick på avatar
  const avatarWrapper = event.target.closest('.avatar-wrapper');
  if (avatarWrapper) {
    const userId = avatarWrapper.getAttribute('data-user-id');
    switchView('profile-view', userId);
    return;
  }

  // Reaktionsknappar
  const reactionButton = event.target.closest('.reaction-btn');
  if (reactionButton) {
    event.stopPropagation();
    if (reactionButton.classList.contains('add-reaction-btn')) {
      openEmojiPicker(reactionButton);
    } else if (reactionButton.classList.contains('existing-reaction')) {
      const emoji = reactionButton.getAttribute('data-emoji');
      const msgIndex = parseInt(reactionButton.getAttribute('data-msg-index'), 10);
      toggleReaction(msgIndex, emoji);
    }
  }
});

// --- Navigation och vyer ---

document.querySelector('.nav-bar').addEventListener('click', function(event) {
  const navItem = event.target.closest('.nav-item');
  if (navItem) {
    const viewId = navItem.getAttribute('data-view');
    switchView(viewId, viewId === 'profile-view' ? currentUserId : null);
  }
});

document.getElementById('home-view').addEventListener('click', function(event) {
  const channelButton = event.target.closest('.channel-list-item[data-channel-id]');
  if (channelButton) {
    const channelId = channelButton.getAttribute('data-channel-id');
    if (channelId !== currentChannelId) {
      currentChannelId = channelId;
      localStorage.setItem('currentChannelId', currentChannelId);
      renderHomeView();
    }
    switchView('chat-view');
  }

  const joinButton = event.target.closest('.join-channel-btn');
  if (joinButton) {
    const channelId = joinButton.getAttribute('data-channel-id');
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user.channels) user.channels = [];
    user.channels.push(channelId);
    saveCurrentUser(user);

    if (!allChannels[channelId].members.includes(user.id)) {
      allChannels[channelId].members.push(user.id);
      saveChannels();
    }
    renderHomeView();
  }

  if (event.target.id === 'create-channel-btn') {
    let channelName = prompt('Ange namn på den nya kanalen (t.ex. #pausrummet):');
    if (channelName && channelName.trim() !== '') {
      channelName = channelName.trim();
      const isPrivate = confirm('Ska kanalen vara privat?');
      const newChannelId = 'ch' + Date.now();
      const formattedName = channelName.startsWith('#') ? channelName : `# ${channelName}`;

      allChannels[newChannelId] = { name: formattedName, isPublic: !isPrivate, isDM: false, members: [currentUserId] };
      allMessages[newChannelId] = [];
      saveChannels();
      saveMessages();

      const user = JSON.parse(localStorage.getItem('currentUser'));
      if (!user.channels) user.channels = [];
      user.channels.push(newChannelId);
      saveCurrentUser(user);

      currentChannelId = newChannelId;
      localStorage.setItem('currentChannelId', currentChannelId);
      
      renderHomeView();
      switchView('chat-view');
    }
  }
});

// --- Profilvy ---

document.getElementById('profile-view').addEventListener('click', function(event) {
  if (event.target.id === 'logout-btn') {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }
  if (event.target.closest('#clear-status-btn')) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.statusMessage = '';
    saveCurrentUser(user);
    renderProfileView();
  }
  if (event.target.closest('#status-send-btn')) {
    saveStatus();
  }
});

document.getElementById('profile-view').addEventListener('input', function(event) {
  if (event.target.id === 'status-message-input') {
    document.getElementById('status-send-btn').classList.toggle('hidden', event.target.value.trim().length === 0);
  }
});

document.getElementById('profile-view').addEventListener('change', function(event) {
  if (event.target.id === 'dnd-toggle') {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.doNotDisturb = event.target.checked;
    saveCurrentUser(user);
    renderProfileView();
  }
});

// --- Globala och diverse lyssnare ---

document.addEventListener('click', (event) => {
  if (!event.target.closest('.type-selector-wrapper')) {
    typeSelectorDropdown.classList.add('hidden');
  }
  if (!event.target.closest('.emoji-picker') && !event.target.closest('.add-reaction-btn') && !event.target.closest('#channel-menu-btn')) {
    closeAllMenus();
  }
});

document.querySelector('.header-channel-info').addEventListener('click', () => {
  if (document.getElementById('chat-view').classList.contains('active-view')) {
    openMemberListModal();
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === 'chatMessages' || event.key === 'allChannels' || event.key === 'allUsers') {
    allMessages = JSON.parse(localStorage.getItem('chatMessages')) || {};
    allChannels = JSON.parse(localStorage.getItem('allChannels')) || {};
    allUsers = JSON.parse(localStorage.getItem('allUsers')) || {};
    const activeView = document.querySelector('.view.active-view');
    if (activeView) {
      switchView(activeView.id);
    }
  }
});

// --- NYTT: Event listeners för inbjudningsmodalen ---
document.getElementById('invite-modal-close-btn').addEventListener('click', closeInviteModal);
document.getElementById('invite-modal').addEventListener('click', (event) => {
  // Stäng modalen om man klickar på bakgrunden
  if (event.target.id === 'invite-modal') {
    closeInviteModal();
  }
  // Hantera klick på "Bjud in"-knappen
  if (event.target.classList.contains('invite-btn')) {
    const userId = event.target.getAttribute('data-user-id');
    inviteUserToChannel(userId);
  }
});

// --- NYTT: Event listeners för medlemslist-modalen ---
document.getElementById('member-list-close-btn').addEventListener('click', closeMemberListModal);
document.getElementById('member-list-modal').addEventListener('click', (event) => {
  // Stäng modalen om man klickar på bakgrunden
  if (event.target.id === 'member-list-modal') {
    closeMemberListModal();
  }
});