// =================================================================
// EVENTS.JS
// Innehåller alla händelselyssnare (event listeners).
// =================================================================

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

  sendBtn.addEventListener('click', (event) => {
    // KORRIGERING: Förhindra att ett eventuellt formulär skickas, vilket skulle ladda om sidan.
    event.preventDefault();
    sendMessageHandler();
  });
  // ANMÄRKNING: Byt från 'keypress' till 'keydown'. 'keydown' är mer tillförlitligt
  // för att fånga tangenttryckningar och förhindra webbläsarens standardbeteende,
  // vilket kan ha orsakat den oönskade navigeringen när man tryckte på Enter.
  inputField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Förhindra webbläsarens standardbeteende (t.ex. formulär-submit)
      sendMessageHandler();
    }
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
    const msgId = taskBox.dataset.msgId;
    taskBox.classList.add('claimed-anim');
    // Anropa den nya, korrekta funktionen i app.js.
    // Realtidslyssnaren i state.js kommer att uppdatera UI:t.
    claimTask(msgId);
    return;
  }

  // "Markera som klar"-knapp
  const completeBtn = event.target.closest('.complete-task-btn');
  if (completeBtn) {
    const taskBox = event.target.closest('.message-container');
    if (taskBox) {
      const msgId = taskBox.dataset.msgId;
      // Anropa den nya, korrekta funktionen i app.js.
      // Realtidslyssnaren i state.js kommer att uppdatera UI:t.
      completeTask(msgId);
    }
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

/**
 * NYTT: Sätter upp en IntersectionObserver för att markera meddelanden som lästa
 * när de scrollas in i vyn.
 * @param {HTMLElement} viewContainer - Elementet som innehåller chattflödet.
 */
function setupReadReceiptObserver(viewContainer) {
  const chatFeed = viewContainer.querySelector('.chat-feed');
  if (!chatFeed) return;

  const options = {
    root: chatFeed,
    rootMargin: '0px',
    threshold: 0.8 // Meddelandet måste vara 80% synligt
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const msgId = entry.target.dataset.msgId;
        db.collection('messages').doc(msgId).update({ [`readBy.${currentUserId}`]: new Date().toISOString() });
        observer.unobserve(entry.target); // Markera bara som läst en gång
      }
    });
  }, options);

  // Observera alla meddelanden som inte är från den inloggade användaren
  viewContainer.querySelectorAll('.message-container:not(.is-current-user)').forEach(el => observer.observe(el));
  window.readReceiptObserver = observer; // Spara en global referens för att kunna koppla bort den.
}

/**
 * KORRIGERING: All kod som kopplar händelselyssnare har samlats i en enda funktion
 * som körs när DOM:en är fullständigt laddad. Detta förhindrar race conditions
 * och gör koden mycket mer robust och lättare att felsöka.
 */
document.addEventListener('DOMContentLoaded', () => {
  // KORRIGERING: Fyll i rullgardinsmenyn för meddelandetyp här.
  // Detta garanterar att DOM-elementen finns innan vi försöker manipulera dem.
  renderTypeSelectorDropdown();

  // KORRIGERING: Hämta referenser till DOM-element HÄR, inuti DOMContentLoaded.
  // Detta garanterar att elementen existerar när skriptet försöker hitta dem,
  // vilket förhindrar den krasch som gjorde att inga knappar fungerade.
  const typeSelectorBtn = document.getElementById('type-selector-btn');
  const typeSelectorDropdown = document.getElementById('type-selector-dropdown');

  let longPressTimer;

  // Koppla alla statiska lyssnare som ska finnas under hela appens livstid.

  // --- Meddelandetyp-väljare ---
  if (typeSelectorBtn && typeSelectorDropdown) {
    typeSelectorBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      typeSelectorDropdown.classList.toggle('hidden');
    });
  }

  // --- Huvud-chattvyn (input och meddelanden) ---
  // Dessa använder eventdelegering och kan kopplas en gång till sina containers.
  attachMessageViewEvents(document.getElementById('chat-view'));
  attachInputAreaEvents(document.getElementById('chat-view'));

  // TODO: Funktionalitet för "nya meddelanden"-bubblan är tillfälligt borttagen för felsökning.

  // --- Tooltips för reaktioner ---
  const appContainer = document.querySelector('.app-container');
  appContainer.addEventListener('mouseover', (event) => {
    const reactionBtn = event.target.closest('.existing-reaction');
    if (reactionBtn) showReactionTooltip(reactionBtn);
  });
  appContainer.addEventListener('mouseout', (event) => {
    if (event.target.closest('.existing-reaction')) hideReactionTooltip();
  });
  appContainer.addEventListener('touchstart', (event) => {
    const reactionBtn = event.target.closest('.existing-reaction');
    if (reactionBtn) {
      longPressTimer = setTimeout(() => showReactionTooltip(reactionBtn), 500);
    }
  }, { passive: true });
  appContainer.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
    hideReactionTooltip();
  });
  appContainer.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
    hideReactionTooltip();
  });

  // --- Delegerad lyssnare för vyer ---
  document.getElementById('home-view').addEventListener('click', (event) => {
    const channelButton = event.target.closest('.channel-list-item[data-channel-id]');
    if (channelButton) {
      switchView('chat-view', { channelId: channelButton.getAttribute('data-channel-id') });
      return;
    }
    const joinButton = event.target.closest('.join-channel-btn');
    if (joinButton) {
      const channelId = joinButton.getAttribute('data-channel-id');
      const batch = db.batch();
      batch.update(db.collection('users').doc(currentUserId), { channels: firebase.firestore.FieldValue.arrayUnion(channelId) });
      batch.update(db.collection('channels').doc(channelId), { members: firebase.firestore.FieldValue.arrayUnion(currentUserId) });
      const joinMessage = { type: 'system', text: 'har gått med i kanalen.', actorId: currentUserId, timestamp: new Date().toISOString(), channelId: channelId };
      batch.set(db.collection('messages').doc(), joinMessage);
      batch.commit().catch(error => console.error("Kunde inte gå med i kanal:", error));
      return;
    }
    const acceptBtn = event.target.closest('.accept-invite-btn');
    if (acceptBtn) {
      acceptInvitation(acceptBtn.dataset.channelId);
      return;
    }
    const declineBtn = event.target.closest('.decline-invite-btn');
    if (declineBtn) {
      declineInvitation(declineBtn.dataset.channelId);
      return;
    }
    if (event.target.id === 'create-channel-btn') {
      openCreateChannelModal();
      return;
    }
  });

  document.getElementById('profile-view').addEventListener('click', (event) => {
    if (event.target.id === 'logout-btn') firebase.auth().signOut();
    if (event.target.closest('#clear-status-btn')) db.collection('users').doc(currentUserId).update({ statusMessage: '' });
    if (event.target.closest('#status-send-btn')) saveStatus();
    if (event.target.closest('#change-avatar-btn')) document.getElementById('avatar-upload-input').click();
    const startDmBtn = event.target.closest('#start-dm-btn');
    if (startDmBtn) startDirectMessage(startDmBtn.dataset.userId);
  });

  document.getElementById('profile-view').addEventListener('input', (event) => {
    if (event.target.id === 'status-message-input') {
      document.getElementById('status-send-btn').classList.toggle('hidden', event.target.value.trim().length === 0);
    }
  });

  document.getElementById('profile-view').addEventListener('change', (event) => {
    if (event.target.id === 'dnd-toggle') {
      db.collection('users').doc(currentUserId).update({ doNotDisturb: event.target.checked });
    }
  });

  document.getElementById('avatar-upload-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => changeAvatar(e.target.result);
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  });

  // --- Globala lyssnare ---
  document.addEventListener('click', (event) => {
    const navItem = event.target.closest('.nav-bar .nav-item');
    if (navItem) {
      switchView(navItem.dataset.view);
      return;
    }
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

  document.getElementById('settings-view').addEventListener('change', (event) => {
    if (!currentUser) return;
    if (event.target.id === 'notifications-enabled-toggle') {
      db.collection('users').doc(currentUserId).update({ 'settings.notifications.enabled': event.target.checked });
    }
    if (event.target.id === 'notifications-sound-toggle') {
      db.collection('users').doc(currentUserId).update({ 'settings.notifications.sound': event.target.checked });
    }
  });

  // --- Modaler och formulär ---
  document.getElementById('invite-modal-close-btn').addEventListener('click', closeInviteModal);
  document.getElementById('invite-modal').addEventListener('click', (event) => {
    if (event.target.id === 'invite-modal') closeInviteModal();
    if (event.target.classList.contains('invite-btn')) inviteUserToChannel(event.target.dataset.userId);
  });

  document.getElementById('pinned-message-container').addEventListener('click', (event) => {
    const unpinBtn = event.target.closest('.unpin-btn');
    if (unpinBtn) togglePinMessage(unpinBtn.dataset.msgId);
  });

  document.getElementById('member-list-close-btn').addEventListener('click', closeMemberListModal);
  document.getElementById('member-list-modal').addEventListener('click', (event) => {
    if (event.target.id === 'member-list-modal') closeMemberListModal();
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

    const newChannel = { name: formattedName, isPublic: !isPrivate, isDM: false, members: [currentUserId], createdBy: currentUserId, createdAt: new Date().toISOString() };
    const batch = db.batch();
    batch.set(db.collection('channels').doc(newChannelId), newChannel);
    batch.update(db.collection('users').doc(currentUserId), { channels: firebase.firestore.FieldValue.arrayUnion(newChannelId) });
    batch.commit().then(closeCreateChannelModal).catch(error => console.error("Kunde inte skapa kanal:", error));
  });

  document.getElementById('app-header').addEventListener('click', (event) => {
    const avatarBtn = event.target.closest('#header-left-content .avatar-wrapper');
    if (avatarBtn && document.getElementById('home-view').classList.contains('active-view')) {
      switchView('profile-view', currentUserId);
    }
  });

  // Denna lyssnare är för synk mellan flikar och bör tas bort när localStorage är helt utfasat.
  window.addEventListener('storage', (event) => {
    if (event.key === 'lastActiveView' || event.key === 'currentChannelId') {
      // Ladda om för att synka, en enkel men ineffektiv lösning.
      window.location.reload();
    }
  });
});