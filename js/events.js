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

sendBtn.addEventListener('click', () => {
  const threadId = sendBtn.dataset.threadId || null;
  sendMessage(threadId, null);
});

inputField.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    const threadId = sendBtn.dataset.threadId || null;
    sendMessage(threadId, null);
  }
});

// --- Meddelandetyp-väljare ---

typeSelectorBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  typeSelectorDropdown.classList.toggle('hidden');
});

// --- Chattflöde (delegerad eventhantering) ---

function attachMessageViewEvents(viewContainer) {
  viewContainer.addEventListener('click', function(event) {
  // NYTT: Bestäm vilken vy (huvudchatt eller tråd) som är aktiv för klicket.
  const threadView = document.getElementById('thread-view-container');
  const isInThreadView = !threadView.classList.contains('hidden') && threadView.contains(event.target);
  const activeView = isInThreadView ? threadView : document.getElementById('chat-view');
  // Om klicket inte är i en chatt-feed (varken huvud eller tråd), avbryt.
  if (!event.target.closest('.chat-feed')) {
    return;
  }

  // "Jag tar denna"-knapp (fungerar bara i huvudvyn)
  const taskBtn = event.target.closest('.task-btn');
  if (taskBtn) {
    const taskBox = event.target.closest('.message-container');
    const index = taskBox.dataset.msgIndex; // FIX: Använd dataset för att hämta index
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

  // NYTT: Fäst-knapp
  const pinButton = event.target.closest('.pin-btn');
  if (pinButton) {
    const msgIndex = parseInt(pinButton.getAttribute('data-msg-index'), 10);
    togglePinMessage(msgIndex);
  }

  // NYTT: Svara i tråd-knapp
  const replyButton = event.target.closest('.reply-btn');
  if (replyButton) {
    event.stopPropagation();
    const msgId = replyButton.dataset.msgId;
    openThreadView(msgId);
  }

  // NYTT: Redigera-knapp
  const editButton = event.target.closest('.edit-btn');
  if (editButton) {
    const msgIndex = parseInt(editButton.dataset.msgIndex, 10);
    const messageElement = activeView.querySelector(`.message-container[data-msg-index="${msgIndex}"]`);
    const textBlock = messageElement.querySelector('.text-block');
    const originalText = allMessages[currentChannelId][msgIndex].text;

    // Spara originalinnehållet så vi kan återställa det
    const originalContent = textBlock.innerHTML;

    // Byt ut innehållet mot ett redigeringsgränssnitt
    textBlock.innerHTML = `
      <div class="edit-container">
        <textarea class="edit-textarea">${originalText}</textarea>
        <div class="edit-actions">
          <button class="cancel-edit-btn">Avbryt</button>
          <button class="save-edit-btn">Spara ändringar</button>
        </div>
      </div>
    `;

    // Fokusera på textrutan och placera markören i slutet
    const textarea = textBlock.querySelector('.edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(originalText.length, originalText.length);

    // Lyssnare för Spara/Avbryt
    textBlock.querySelector('.save-edit-btn').addEventListener('click', () => {
      const newText = textarea.value.trim();
      if (newText) {
        // Anropa editMessage och se till att rätt vy ritas om.
        editMessage(msgIndex, newText, isInThreadView);
      } else {
        // Om texten är tom, återställ.
        // Använd createMessageElement för att säkerställa att alla lyssnare kopplas korrekt igen.
        messageElement.replaceWith(createMessageElement(allMessages[currentChannelId][msgIndex], msgIndex, isInThreadView ? 'thread' : 'chat'));
      }
    });
    textBlock.querySelector('.cancel-edit-btn').addEventListener('click', () => {
      textBlock.innerHTML = originalContent;
    });
  }

  // NYTT: Klick på fäst meddelande-rutan
  const pinnedMessageContent = event.target.closest('.pinned-message-content');
  if (pinnedMessageContent) {
    const msgIndex = parseInt(pinnedMessageContent.dataset.msgIndex, 10);
    const messageElement = document.querySelector(`.message-container[data-msg-index="${msgIndex}"]`);
    // Scrolla till och markera meddelandet
    messageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // NYTT: Klick på länk till trådsvar ("X svar")
  const threadParticipants = event.target.closest('.thread-participants');
  if (threadParticipants) {
      openThreadView(threadParticipants.dataset.msgId);
  }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachMessageViewEvents(document.getElementById('chat-view'));
});

// --- NYTT: Logik för att visa tooltips för reaktioner (både mobil och desktop) ---

let longPressTimer;

function showReactionTooltip(reactionBtn) {
  // Ta bort eventuell befintlig tooltip för att undvika dubbletter
  hideReactionTooltip();

  const msgIndex = reactionBtn.dataset.msgIndex;
  const emoji = reactionBtn.dataset.emoji;
  const msg = allMessages[currentChannelId][msgIndex];
  const userIds = msg?.reactions?.[emoji] || [];

  if (userIds.length === 0) return;

  const userNames = userIds.map(id => {
    return id === currentUserId ? 'Du' : (allUsers[id]?.name || 'Okänd');
  }).join(', ');

  const tooltip = document.createElement('div');
  tooltip.id = 'reaction-tooltip';
  tooltip.className = 'reaction-tooltip';
  tooltip.textContent = userNames;
  document.body.appendChild(tooltip);

  const btnRect = reactionBtn.getBoundingClientRect();
  tooltip.style.left = `${btnRect.left + (btnRect.width / 2) - (tooltip.offsetWidth / 2)}px`;
  tooltip.style.top = `${btnRect.top - tooltip.offsetHeight - 5}px`;
}

function hideReactionTooltip() {
  const existingTooltip = document.getElementById('reaction-tooltip');
  if (existingTooltip) existingTooltip.remove();
}

// Händelselyssnare för datorer (muspekare)
document.querySelector('.app-container').addEventListener('mouseover', function(event) {
  const reactionBtn = event.target.closest('.existing-reaction');
  if (reactionBtn) {
    showReactionTooltip(reactionBtn);
  }
});

document.querySelector('.app-container').addEventListener('mouseout', function(event) {
  const reactionBtn = event.target.closest('.existing-reaction');
  if (reactionBtn) {
    hideReactionTooltip();
  }
});

// Händelselyssnare för mobila enheter (tryck och håll)
document.querySelector('.app-container').addEventListener('touchstart', function(event) {
  const reactionBtn = event.target.closest('.existing-reaction');
  if (reactionBtn) {
    // Starta en timer. Om den inte avbryts visas tooltipen.
    longPressTimer = setTimeout(() => {
      showReactionTooltip(reactionBtn);
    }, 500); // 500 ms för ett "långt tryck"
  }
}, { passive: true }); // passive: true för bättre scroll-prestanda

document.querySelector('.app-container').addEventListener('touchend', function(event) {
  // Avbryt alltid timern och dölj tooltipen när fingret lyfts.
  clearTimeout(longPressTimer);
  hideReactionTooltip();
});

document.querySelector('.app-container').addEventListener('touchmove', function(event) {
  // Om användaren börjar scrolla, avbryt det långa trycket.
  clearTimeout(longPressTimer);
  hideReactionTooltip();
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
    
    // FIX: Uppdatera även den globala användarlistan i minnet
    allUsers[user.id] = JSON.parse(localStorage.getItem('currentUser'));

    if (!allChannels[channelId].members.includes(user.id)) {
      allChannels[channelId].members.push(user.id);
      saveChannels();

      // Skapa ett systemmeddelande om att användaren har anslutit
      const joinMessage = {
        type: 'system',
        text: 'har anslutit till kanalen.',
        actorId: currentUserId,
        timestamp: new Date()
      };
      allMessages[channelId].push(joinMessage);
      saveMessages();
    }
    renderHomeView();
  }

  if (event.target.id === 'create-channel-btn') {
    openCreateChannelModal();
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
  if (event.target.closest('#change-avatar-btn')) {
    // NYTT: Öppna filbläddraren istället för en prompt
    document.getElementById('avatar-upload-input').click();
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

// --- NYTT: Lyssnare för när en ny profilbild har valts ---
document.getElementById('avatar-upload-input').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      // När filen är inläst, anropa changeAvatar med bildens data (Base64)
      changeAvatar(e.target.result);
    };
    reader.readAsDataURL(file);
  }
  // Återställ input-fältet så att man kan ladda upp samma fil igen om man vill
  event.target.value = '';
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
    const oldMessages = { ...allMessages };
    const oldMessageCount = allMessages[currentChannelId]?.length || 0;
    allMessages = JSON.parse(localStorage.getItem('chatMessages')) || {};
    const newMessages = allMessages[currentChannelId] || [];
    const newMessageCount = newMessages.length || 0;

    // Om ett meddelande har lagts till i den aktuella kanalen, spela ljud.
    if (newMessageCount > oldMessageCount && newMessages.length > 0) {
      const lastMessage = newMessages[newMessages.length - 1];
      const sender = allUsers[lastMessage.userId];

      // Spela bara ljud och visa notis om meddelandet inte är från den egna användaren
      // och inte är ett systemmeddelande.
      if (lastMessage.userId !== currentUserId && lastMessage.type !== 'system' && sender) {
        playNewMessageSound();
        const channelName = allChannels[currentChannelId]?.name || 'Nytt meddelande';
        // Visa en notis
        showNotification(`${sender.name} i ${channelName}`, { body: lastMessage.text });
      }
    }

    allChannels = JSON.parse(localStorage.getItem('allChannels')) || {};
    allUsers = JSON.parse(localStorage.getItem('allUsers')) || {};
    const activeView = document.querySelector('.view.active-view');
    if (activeView) {
      switchView(activeView.id);
    }
  }
});

// --- NYTT: Inställningsvy ---
document.getElementById('settings-view').addEventListener('change', function(event) {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  if (!user.settings) { // Dubbelkolla så att objektet finns
    user.settings = { notifications: { enabled: true, sound: true, showContent: true } };
  }

  if (event.target.id === 'notifications-enabled-toggle') {
    user.settings.notifications.enabled = event.target.checked;
    saveCurrentUser(user);
    // Uppdatera UI direkt
    renderSettingsView();
  }

  if (event.target.id === 'notifications-sound-toggle') {
    user.settings.notifications.sound = event.target.checked;
    saveCurrentUser(user);
    // Uppdatera UI direkt
    renderSettingsView();
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

// --- NYTT: Event listener för den fästa meddelanderutan ---
document.getElementById('pinned-message-container').addEventListener('click', (event) => {
  // Hantera klick på "Lossa"-knappen
  const unpinBtn = event.target.closest('.unpin-btn');
  if (unpinBtn) {
    const msgIndex = parseInt(unpinBtn.dataset.msgIndex, 10);
    togglePinMessage(msgIndex);
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

document.getElementById('create-channel-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const channelNameInput = document.getElementById('channel-name-input');
  const isPrivateToggle = document.getElementById('channel-private-toggle');
  
  let channelName = channelNameInput.value.trim();
  if (channelName === '') return;

  const isPrivate = isPrivateToggle.checked;
  const newChannelId = 'ch' + Date.now();
  const formattedName = channelName.startsWith('#') ? channelName : `# ${channelName}`;
  const user = JSON.parse(localStorage.getItem('currentUser'));
  allChannels[newChannelId] = { name: formattedName, isPublic: !isPrivate, isDM: false, members: [user.id] };
  allMessages[newChannelId] = [];
  
  if (!user.channels) user.channels = [];
  user.channels.push(newChannelId);
  
  // FIX: Uppdatera hela användarobjektet i minnet.
  allUsers[user.id] = { ...allUsers[user.id], ...user };

  saveCurrentUser(user);
  saveAllUsers();
  saveChannels();
  saveMessages();

  currentChannelId = newChannelId;
  localStorage.setItem('currentChannelId', currentChannelId);
  
  closeCreateChannelModal();
  switchView('chat-view');
});