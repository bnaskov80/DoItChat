// =================================================================
// EVENTS.JS
// Innehåller alla händelselyssnare (event listeners).
// =================================================================

const typeSelectorBtn = document.getElementById('type-selector-btn');

// --- Meddelandetyp-väljare ---

typeSelectorBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  typeSelectorDropdown.classList.toggle('hidden');
});

// --- NYTT: Funktion för att koppla lyssnare till ett input-område ---

function attachInputAreaEvents(container, isThread = false, parentMsgId = null) {
  const inputField = container.querySelector('.input-area input');
  const sendBtn = container.querySelector('.send-btn');

  let typingTimer; // Timer för att upptäcka när användaren slutar skriva
  const TYPING_TIMEOUT_DURATION = 3000; // 3 sekunder

  if (!inputField || !sendBtn) return;

  inputField.addEventListener('input', () => {
    sendBtn.classList.toggle('hidden', inputField.value.trim().length === 0);

    // NYTT: Logik för @mentions
    const text = inputField.value;
    // Visa bara om @ är det sista tecknet eller om det inte finns något mellanslag efter det sista @
    if (text.includes('@') && text.lastIndexOf(' ') < text.lastIndexOf('@')) {
      openMentionSuggestions(inputField);
    } else {
      closeMentionSuggestions();
    }

    // NYTT: Logik för att hantera "användare skriver"-indikatorn
    if (!typingTimer) {
      // Användaren har precis börjat skriva, meddela databasen.
      updateTypingStatus(true);
    } else {
      // Användaren skriver fortfarande, återställ timern.
      clearTimeout(typingTimer);
    }

    typingTimer = setTimeout(() => {
      // Användaren har slutat skriva, meddela databasen.
      updateTypingStatus(false);
      typingTimer = null;
    }, TYPING_TIMEOUT_DURATION);
  });

  const sendMessageHandler = () => {
    if (inputField.value.trim() !== '') {
      // Om det är en tråd, skicka med threadId och en callback för att uppdatera UI direkt.
      // NYTT: Använd nu en callback även för vanliga meddelanden för att kunna animera.
      sendMessage(isThread ? parentMsgId : null, inputField.value.trim(), null, (newMessage) => {
        // Denna callback körs bara för vanliga meddelanden, inte trådar (de har sin egen).
        if (!isThread) {
          const messages = allMessages[currentChannelId] || [];
          const newIndex = messages.length - 1; // Sista meddelandet som precis lades till
          const messageElement = createMessageElement(newMessage, newIndex, 'chat');
          // NYTT: Applicera animationen på den inre pratbubblan istället för hela containern.
          const textBlock = messageElement.querySelector('.text-block');
          if (textBlock) textBlock.classList.add('new-message-anim');
          chatFeed.appendChild(messageElement);
          chatFeed.scrollTop = chatFeed.scrollHeight;
        }
      });
      // NYTT: Rensa input-fältet och dölj knappen här, efter att meddelandet har skickats.
      // Detta säkerställer att det alltid händer, oavsett callback.
      inputField.value = '';
      sendBtn.classList.add('hidden');
      closeMentionSuggestions(); // Stäng förslagsrutan när meddelandet skickas

      // NYTT: Meddela omedelbart att vi har slutat skriva när meddelandet skickas.
      clearTimeout(typingTimer);
      typingTimer = null;
      updateTypingStatus(false);
    }
  };

  sendBtn.addEventListener('click', sendMessageHandler);
  inputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') sendMessageHandler();
  });
}

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

  // NYTT: Klick på raderingsknappen i en checklista
  const deleteItemBtn = event.target.closest('.delete-item-btn');
  if (deleteItemBtn) {
    const itemElement = deleteItemBtn.closest('.checklist-item');
    const msgId = itemElement.dataset.msgId;
    const itemIndex = parseInt(itemElement.dataset.itemIndex, 10);
    deleteChecklistItem(msgId, itemIndex);
    return;
  }

  // NYTT: Klick på en punkt i en checklista (körs bara om raderingsknappen inte klickades)
  const checklistItem = event.target.closest('.checklist-item');
  if (checklistItem) {
    const msgId = checklistItem.dataset.msgId;
    const itemIndex = parseInt(checklistItem.dataset.itemIndex, 10);
    toggleChecklistItem(msgId, itemIndex);
    return;
  }

  // NYTT: Klick på "+ Lägg till punkt" i en checklista
  const addItemBtn = event.target.closest('.add-item-btn');
  if (addItemBtn) {
    const msgId = addItemBtn.dataset.msgId;
    const container = document.getElementById(`add-item-container-${msgId}`);
    
    // Byt ut knappen mot ett input-fält och en spara-knapp
    container.innerHTML = `
      <div class="add-item-input-wrapper">
        <input type="text" class="add-item-input" placeholder="Ny punkt...">
        <button class="save-item-btn">Spara</button>
      </div>
    `;

    const input = container.querySelector('.add-item-input');
    const saveBtn = container.querySelector('.save-item-btn');
    input.focus();

    const saveItem = () => {
      const text = input.value.trim();
      if (text) {
        addChecklistItem(msgId, text);
      }
      // Återställ till knappen. UI uppdateras av realtidslyssnaren.
      container.innerHTML = `<button class="add-item-btn" data-msg-id="${msgId}">+ Lägg till punkt</button>`;
    };

    saveBtn.addEventListener('click', saveItem);
    input.addEventListener('keypress', (e) => e.key === 'Enter' && saveItem());
    
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
    // Använd meddelandets unika ID istället för dess index
    const msgId = pinButton.dataset.msgId;
    togglePinMessage(msgId);
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
  // NYTT: Koppla händelselyssnare specifikt för huvudchattens inmatningsfält.
  // Detta ersätter den borttagna, konfliktande koden.
  attachInputAreaEvents(document.getElementById('chat-view'));
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

// KORRIGERING: Slå ihop ALLA lyssnare för hemvyn till en enda för att undvika konflikter.
document.getElementById('home-view').addEventListener('click', function(event) {
  // --- Klick på kanalknappar ---
  const channelButton = event.target.closest('.channel-list-item[data-channel-id]');
  if (channelButton) {
    const channelId = channelButton.getAttribute('data-channel-id');
    switchView('chat-view', { channelId: channelId });
    return;
  }

  // --- Klick på "Gå med"-knapp ---
  const joinButton = event.target.closest('.join-channel-btn');
  if (joinButton) {
    const channelId = joinButton.getAttribute('data-channel-id');
    const batch = db.batch();
    batch.update(db.collection('users').doc(currentUserId), { channels: firebase.firestore.FieldValue.arrayUnion(channelId) });
    batch.update(db.collection('channels').doc(channelId), { members: firebase.firestore.FieldValue.arrayUnion(currentUserId) });
    const joinMessage = {
      type: 'system', text: 'har gått med i kanalen.', actorId: currentUserId,
      timestamp: new Date().toISOString(), channelId: channelId
    };
    batch.set(db.collection('messages').doc(), joinMessage);
    batch.commit().catch(error => console.error("Kunde inte gå med i kanal:", error));
    return;
  }

  // --- Inbjudningsknappar ---
  const acceptBtn = event.target.closest('.accept-invite-btn');
  if (acceptBtn) {
    const channelId = acceptBtn.dataset.channelId;
    acceptInvitation(channelId);
    return;
  }
  const declineBtn = event.target.closest('.decline-invite-btn');
  if (declineBtn) {
    const channelId = declineBtn.dataset.channelId;
    declineInvitation(channelId);
    return;
  }

  // --- Klick på "Skapa kanal"-knapp ---
  if (event.target.id === 'create-channel-btn') {
    openCreateChannelModal();
    return;
  }
});

// --- Profilvy ---

document.getElementById('profile-view').addEventListener('click', function(event) {
  if (event.target.id === 'logout-btn') {
    // Anropa Firebase's utloggningsfunktion.
    // onAuthStateChanged i state.js kommer att hantera omdirigeringen.
    firebase.auth().signOut();
  }
  if (event.target.closest('#clear-status-btn')) {
    db.collection('users').doc(currentUserId).update({ statusMessage: '' });
  }
  if (event.target.closest('#status-send-btn')) {
    saveStatus();
  }
  if (event.target.closest('#change-avatar-btn')) {
    // NYTT: Öppna filbläddraren istället för en prompt
    document.getElementById('avatar-upload-input').click();
  }
  // NYTT: Lyssnare för "Skicka meddelande"-knappen på en annan användares profil.
  const startDmBtn = event.target.closest('#start-dm-btn');
  if (startDmBtn) {
    const otherUserId = startDmBtn.dataset.userId;
    startDirectMessage(otherUserId);
  }
});

document.getElementById('profile-view').addEventListener('input', function(event) {
  if (event.target.id === 'status-message-input') {
    document.getElementById('status-send-btn').classList.toggle('hidden', event.target.value.trim().length === 0);
  }
});

document.getElementById('profile-view').addEventListener('change', function(event) {
  if (event.target.id === 'dnd-toggle') {
    const isChecked = event.target.checked;
    db.collection('users').doc(currentUserId).update({ doNotDisturb: isChecked });
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

// --- NYTT: Inställningsvy ---
document.getElementById('settings-view').addEventListener('change', function(event) {
  if (!currentUser) return;

  if (event.target.id === 'notifications-enabled-toggle') {
    const isEnabled = event.target.checked;
    db.collection('users').doc(currentUserId).update({
      'settings.notifications.enabled': isEnabled
    });
  }

  if (event.target.id === 'notifications-sound-toggle') {
    const isEnabled = event.target.checked;
    db.collection('users').doc(currentUserId).update({
      'settings.notifications.sound': isEnabled
    });
  }
});

// --- NYTT: Event listeners för inbjudningsmodalen ---
document.getElementById('invite-modal-close-btn').addEventListener('click', closeInviteModal);
document.getElementById('invite-modal').addEventListener('click', (event) => {
  if (event.target.id === 'invite-modal') {
    closeInviteModal();
  }
  if (event.target.classList.contains('invite-btn')) {
    const userId = event.target.getAttribute('data-user-id');
    inviteUserToChannel(userId);
  }
});

// --- NYTT: Event listener för den fästa meddelanderutan ---
document.getElementById('pinned-message-container').addEventListener('click', (event) => {
  const unpinBtn = event.target.closest('.unpin-btn');
  if (unpinBtn) {
    const msgId = unpinBtn.dataset.msgId;
    togglePinMessage(msgId);
  }
});

// --- NYTT: Event listeners för medlemslist-modalen ---
document.getElementById('member-list-close-btn').addEventListener('click', closeMemberListModal);
document.getElementById('member-list-modal').addEventListener('click', (event) => {
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
  const formattedName = channelName.startsWith('#') ? channelName : `# ${channelName.toLowerCase().replace(/\s+/g, '-')}`;

  const newChannel = {
    name: formattedName,
    isPublic: !isPrivate,
    isDM: false,
    members: [currentUserId],
    createdBy: currentUserId,
    createdAt: new Date().toISOString()
  };

  const batch = db.batch();
  batch.set(db.collection('channels').doc(newChannelId), newChannel);
  batch.update(db.collection('users').doc(currentUserId), {
    channels: firebase.firestore.FieldValue.arrayUnion(newChannelId)
  });

  batch.commit().then(() => {
    // Vänta på att realtidslyssnaren har uppdaterat vårt lokala state
    // innan vi byter vy.
    closeCreateChannelModal();
    // Byt inte vy direkt. Realtidslyssnaren i state.js kommer att anropa
    // syncAndRerenderAllViews() som uppdaterar hemvyn med den nya kanalen.
  }).catch(error => {
    console.error("Kunde inte skapa kanal:", error);
    alert("Ett fel uppstod när kanalen skulle skapas.");
  });
});

// --- NYTT: Lyssnare för header-element som skapas dynamiskt ---
document.getElementById('app-header').addEventListener('click', function(event) {
  // Klick på avataren i hemvyn
  const avatarBtn = event.target.closest('#header-left-content .avatar-wrapper');
  if (avatarBtn && document.getElementById('home-view').classList.contains('active-view')) {+    switchView('profile-view', currentUserId);
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
// document.getElementById('home-view').addEventListener('click', function(event) {
//   const channelButton = event.target.closest('.channel-list-item[data-channel-id]');
//   if (channelButton) {
//     const channelId = channelButton.getAttribute('data-channel-id');
//     if (channelId !== currentChannelId) {
//       currentChannelId = channelId;
//       localStorage.setItem('currentChannelId', currentChannelId);
//       renderHomeView();
//     }
//     switchView('chat-view');
//   }

//   const joinButton = event.target.closest('.join-channel-btn');
//   if (joinButton) {
//     const channelId = joinButton.getAttribute('data-channel-id');
//     const batch = db.batch();
//     // Lägg till kanalen i användarens lista
//     batch.update(db.collection('users').doc(currentUserId), { channels: firebase.firestore.FieldValue.arrayUnion(channelId) });
//     // Lägg till användaren i kanalens medlemslista
//     batch.update(db.collection('channels').doc(channelId), { members: firebase.firestore.FieldValue.arrayUnion(currentUserId) });

//     // Realtidslyssnarna kommer att uppdatera UI:t
//     batch.commit().catch(error => console.error("Kunde inte gå med i kanal:", error));
//   }

//   if (event.target.id === 'create-channel-btn') {
//     openCreateChannelModal();
//   }
// });

// --- Profilvy ---

document.getElementById('profile-view').addEventListener('click', function(event) {
  if (event.target.id === 'logout-btn') {
    // Anropa Firebase's utloggningsfunktion.
    // onAuthStateChanged i state.js kommer att hantera omdirigeringen.
    firebase.auth().signOut();
  }
  if (event.target.closest('#clear-status-btn')) {
    db.collection('users').doc(currentUserId).update({ statusMessage: '' });
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
    const isChecked = event.target.checked;
    db.collection('users').doc(currentUserId).update({ doNotDisturb: isChecked });
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
  if (!currentUser) return;

  if (event.target.id === 'notifications-enabled-toggle') {
    const isEnabled = event.target.checked;
    db.collection('users').doc(currentUserId).update({
      'settings.notifications.enabled': isEnabled
    });
  }

  if (event.target.id === 'notifications-sound-toggle') {
    const isEnabled = event.target.checked;
    db.collection('users').doc(currentUserId).update({
      'settings.notifications.sound': isEnabled
    });
  }
});

// --- NYTT: Event listeners för inbjudningsmodalen ---
document.getElementById('invite-modal-close-btn').addEventListener('click', closeInviteModal);
document.getElementById('invite-modal').addEventListener('click', (event) => {
  if (event.target.id === 'invite-modal') {
    closeInviteModal();
  }
  if (event.target.classList.contains('invite-btn')) {
    const userId = event.target.getAttribute('data-user-id');
    inviteUserToChannel(userId);
  }
});

// --- NYTT: Event listener för den fästa meddelanderutan ---
document.getElementById('pinned-message-container').addEventListener('click', (event) => {
  const unpinBtn = event.target.closest('.unpin-btn');
  if (unpinBtn) {
    const msgId = unpinBtn.dataset.msgId;
    togglePinMessage(msgId);
  }
});

// --- NYTT: Event listeners för medlemslist-modalen ---
document.getElementById('member-list-close-btn').addEventListener('click', closeMemberListModal);
document.getElementById('member-list-modal').addEventListener('click', (event) => {
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
  const formattedName = channelName.startsWith('#') ? channelName : `# ${channelName.toLowerCase().replace(/\s+/g, '-')}`;

  const newChannel = {
    name: formattedName,
    isPublic: !isPrivate,
    isDM: false,
    members: [currentUserId],
    createdBy: currentUserId,
    createdAt: new Date().toISOString()
  };

  const batch = db.batch();
  batch.set(db.collection('channels').doc(newChannelId), newChannel);
  batch.update(db.collection('users').doc(currentUserId), {
    channels: firebase.firestore.FieldValue.arrayUnion(newChannelId)
  });

  batch.commit().then(() => {
    // Vänta på att realtidslyssnaren har uppdaterat vårt lokala state
    // innan vi byter vy.
    closeCreateChannelModal();
    // Byt inte vy direkt. Realtidslyssnaren i state.js kommer att anropa
    // syncAndRerenderAllViews() som uppdaterar hemvyn med den nya kanalen.
  }).catch(error => {
    console.error("Kunde inte skapa kanal:", error);
    alert("Ett fel uppstod när kanalen skulle skapas.");
  });
});