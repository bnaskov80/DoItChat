// =================================================================
// UI.JS
// Ansvarar för all rendering och DOM-manipulation.
// =================================================================

const chatFeed = document.querySelector('.chat-feed');
const typingIndicator = document.getElementById('typing-indicator');
const typingUserName = document.getElementById('typing-user-name');

function closeAllEmojiPickers() {
  document.querySelectorAll('.emoji-picker').forEach(picker => picker.remove());
}

function closeAllMenus() {
  closeAllEmojiPickers();
  const channelMenu = document.getElementById('channel-menu');
  if (channelMenu) channelMenu.remove();
}

function openEmojiPicker(button) {
  closeAllMenus();

  const msgIndex = button.getAttribute('data-msg-index');
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  EMOJI_OPTIONS.forEach(emoji => {
    const emojiBtn = document.createElement('button');
    emojiBtn.textContent = emoji;
    emojiBtn.addEventListener('click', () => {
      toggleReaction(msgIndex, emoji);
      closeAllEmojiPickers();
    });
    picker.appendChild(emojiBtn);
  });

  document.body.appendChild(picker);

  const btnRect = button.getBoundingClientRect();
  picker.style.left = `${btnRect.right + window.scrollX - picker.offsetWidth}px`;
  picker.style.top = `${btnRect.bottom + window.scrollY + 10}px`;
}

function renderReactions(msg, msgIndex) {
  const reactions = msg.reactions || {};
  const reactionKeys = Object.keys(reactions).filter(key => reactions[key].length > 0);
  if (reactionKeys.length === 0) return '';

  let reactionsHTML = `<div class="reactions-container">`;
  reactionKeys.forEach(emoji => {
    const count = reactions[emoji].length;
    reactionsHTML += `<button class="reaction-btn existing-reaction" data-msg-index="${msgIndex}" data-emoji="${emoji}">${emoji} ${count}</button>`;
  });
  reactionsHTML += '</div>';
  return reactionsHTML;
}

// NYTT: Funktioner för att visa och dölja tooltips för reaktioner.
// Dessa återställdes efter att de av misstag togs bort, vilket bidrog till kraschen.
function showReactionTooltip(reactionBtn) {
  // Ta bort eventuell befintlig tooltip för att undvika dubbletter
  hideReactionTooltip();

  // KORRIGERING: Använd meddelandets unika ID (msgId) istället för dess index.
  // Detta är mycket säkrare eftersom index kan bli fel om listan ändras.
  const msgContainer = reactionBtn.closest('.message-container');
  if (!msgContainer) return;
  
  const msgId = msgContainer.dataset.msgId;
  const msg = allMessages[currentChannelId]?.find(m => m.id === msgId);
  const emoji = reactionBtn.dataset.emoji;

  if (!msg) return; // Avbryt om meddelandet inte hittas

  const userIds = msg.reactions?.[emoji] || [];

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
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

function getAvatarHTML(user) {
  if (!user) return `<div class="avatar-placeholder bg-default">?</div>`;
  if (user.avatarUrl) {
    return `<img src="${user.avatarUrl}" alt="${user.name}" class="avatar-image">`;
  } else {
    return `<div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>`;
  }
}

function renderProfileView(userId) {
  // FIX: Hantera både att få ett ID (sträng) och ett helt användarobjekt.
  const isOwnProfile = (typeof userId !== 'object' && (!userId || userId === currentUserId)) || (typeof userId === 'object' && userId !== null && userId.id === currentUserId);
  let userToView;
  if (typeof userId === 'object') {
    userToView = userId; // Använd objektet direkt
  } else {
    userToView = isOwnProfile ? currentUser : allUsers[userId];
  }
  const profileView = document.getElementById('profile-view');

  if (!userToView) return;

  const status = calculateStatus(userToView.lastSeen, userToView.doNotDisturb);

  profileView.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar-wrapper">
        ${getAvatarHTML(userToView)}
        <div class="status-indicator ${status.key}"></div>
        ${isOwnProfile ? `<button class="change-avatar-btn" id="change-avatar-btn" title="Ändra profilbild"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-camera"></use></svg></button>` : ''}
      </div>
      <div class="profile-info">
        <span class="profile-name">${userToView.name}</span>
        <span class="profile-status">${status.text}</span>
      </div>
    </div>
    <div class="status-message-container">
      ${userToView.statusMessage ? `
        <div class="status-message-display">
          <span>${userToView.statusMessage}</span>
          ${isOwnProfile ? `<button id="clear-status-btn" title="Rensa status"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-x"></use></svg></button>` : ''}
        </div>
      ` : (isOwnProfile ? `
        <div class="input-pill">
          <input type="text" id="status-message-input" placeholder="Ange en status...">
          <button class="send-btn hidden" id="status-send-btn" aria-label="Spara status">
            <svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-up"></use></svg>
          </button>
        </div>
      ` : '')}
    </div>
    ${!isOwnProfile ? `
      <button id="start-dm-btn" class="primary-action-btn" data-user-id="${userToView.id}">Skicka meddelande</button>
    ` : ''}
    ${isOwnProfile ? `
      <div class="home-task-list">
        <hr class="section-divider">
        <h3>Att göra</h3>
        ${(() => {
          const myTasks = Object.values(allMessages).flat().filter(msg => msg.type === 'task' && msg.claimedBy === currentUserId && !msg.completed);
          if (myTasks.length === 0) {
            return '<p class="no-tasks-message">Du har inga pågående uppgifter.</p>';
          }
          return myTasks.map(task => {
            const channelName = allChannels[Object.keys(allMessages).find(key => allMessages[key].includes(task))]?.name || '';
            return `
              <div class="home-task-item claimed">
                <p class="home-task-text">${task.text}</p>
                <span class="home-task-status">${channelName}</span>
              </div>
            `;
          }).join('');
        })()}
      </div>
    ` : ''}
    ${isOwnProfile ? `
      <div class="settings-section">
        <div class="settings-item">
          <div class="settings-item-main">
            <span class="settings-icon"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-moon"></use></svg></span>
            <div class="settings-item-text">
              <span class="settings-item-title">Stör ej</span>
              <span class="settings-item-description">Visa dig själv som inaktiv</span>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="dnd-toggle" ${userToView.doNotDisturb ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <div class="profile-actions">
        <button id="logout-btn" class="list-item-btn">Logga ut</button>
      </div>
    ` : ''}
  `;
}

function renderSettingsView() {
  const settingsView = document.getElementById('settings-view');
  if (!currentUser) return;

  // Säkerställ att inställningar finns
  const settings = currentUser.settings || { notifications: { enabled: true, sound: true } };

  settingsView.innerHTML = `
    <div class="settings-section">
      <div class="settings-item">
        <div class="settings-item-text">
          <span class="settings-item-title">Tillåt notifikationer</span>
          <span class="settings-item-description">Få notiser när nya meddelanden kommer.</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="notifications-enabled-toggle" ${settings.notifications.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    </div>
    <div class="settings-section">
       <div class="settings-item">
        <div class="settings-item-text">
          <span class="settings-item-title">Notifikationsljud</span>
          <span class="settings-item-description">Spela ett ljud för nya meddelanden.</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="notifications-sound-toggle" ${settings.notifications.sound ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    </div>
  `;
}


function rerenderAllVisibleAvatars() {
  // Rita om chattvyn om den är aktiv
  if (document.getElementById('chat-view').classList.contains('active-view')) {
    renderMessages();
  }
  // Rita om hemvyn för att uppdatera headern
  renderHomeView();
}

function renderHomeView() {
  const homeView = document.getElementById('home-view');
  const loggedInUser = currentUser; // Använd den mest pålitliga källan
  const userChannels = loggedInUser?.channels || [];
  const pendingInvites = loggedInUser?.pendingInvites || [];

  // NYTT: Skapa en sektion för väntande inbjudningar
  const invitesHTML = `
    ${pendingInvites.length > 0 ? `
      <div class="channel-list">
        <h3>Inbjudningar</h3>
        ${pendingInvites.map(invite => {
          const channel = allChannels[invite.channelId];
          const inviter = allUsers[invite.invitedBy];
          if (!channel || !inviter) return ''; // Rendera inte om data saknas
          return `
            <div class="invite-list-item">
              <div class="invite-info">
                <span class="invite-channel-name">${channel.name}</span>
                <span class="invite-by-user">Inbjuden av ${inviter.name}</span>
              </div>
              <div class="invite-actions">
                <button class="decline-invite-btn" data-channel-id="${invite.channelId}">Tacka nej</button>
                <button class="accept-invite-btn" data-channel-id="${invite.channelId}">Tacka ja</button>
              </div>
            </div>`;
        }).join('')}
      </div>
      <hr class="section-divider">
    ` : ''}
  `;

  const myChannelsHTML = `
    <div class="channel-list">
      <h3>Dina kanaler</h3>
      ${userChannels.some(id => allChannels[id] && !allChannels[id].isDM && !allChannels[id].isArchived) ?
        userChannels.map(id => {
          const channel = allChannels[id];
          if (!channel || channel.isDM) return '';
          const isMuted = loggedInUser.mutedChannels?.includes(id);
          return `<button class="channel-list-item ${id === currentChannelId ? 'active' : ''}" data-channel-id="${id}">
                    ${!channel.isPublic ? `<svg class="private-channel-icon" viewBox="0 0 256 256"><use href="icons.svg#ph-lock"></use></svg>` : ''}
                    <span>${channel.name}</span>
                    ${isMuted ? `<svg class="muted-channel-icon" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-bell-slashed"></use></svg>` : ''}
                  </button>`;
        }).join('') :
        '<p class="no-tasks-message">Du har inte gått med i några kanaler än.</p>'
      }
    </div>`;

  const browseChannelsHTML = `
    <div class="channel-list">
      <h3>Bläddra bland kanaler</h3>
      ${Object.keys(allChannels).some(id => !userChannels.includes(id) && allChannels[id].isPublic && !allChannels[id].isArchived) ?
        Object.keys(allChannels).map(id => {
          if (userChannels.includes(id) || !allChannels[id].isPublic || allChannels[id].isArchived) return '';
          return `<div class="channel-list-item">
                    <span>${allChannels[id].name}</span>
                    <button class="join-channel-btn" data-channel-id="${id}">Gå med</button>
                  </div>`;
        }).join('') :
        '<p class="no-tasks-message">Inga fler kanaler att gå med i.</p>'
      }
      <button class="create-channel-btn" id="create-channel-btn">+ Skapa kanal</button>
    </div>`;

  const dmChannelsHTML = `
    <div class="channel-list">
      <h3>Direktmeddelanden</h3>
      ${userChannels.some(id => allChannels[id] && allChannels[id].isDM) ?
        userChannels.map(id => { 
          const channel = allChannels[id];
          if (!channel || !channel.isDM) return '';
          const otherUserId = channel.members.find(uid => uid !== currentUserId);
          const otherUser = allUsers[otherUserId] || { name: 'Okänd' };
          return `<button class="channel-list-item ${id === currentChannelId ? 'active' : ''}" data-channel-id="${id}">
                    <span>${otherUser.name}</span>
                  </button>`;
        }).join('') :
        '<p class="no-tasks-message">Du har inga direktmeddelanden.</p>'
      }
    </div>`;

  const channelTasks = (allMessages[currentChannelId] || []).filter(msg => msg.type === 'task');
  const taskHTML = `
    <div class="home-task-list">
      <h3>Uppgifter i ${allChannels[currentChannelId]?.name || ''}</h3>
      ${channelTasks.length > 0 ?
        channelTasks.map(task => {
          let statusHTML = '';
          let itemClass = '';
          if (task.completed) {
            statusHTML = `<span class="home-task-status">✓ Klart</span>`;
            itemClass = 'completed';
          } else if (task.claimedBy) {
            statusHTML = `<span class="home-task-status">Tagen av ${allUsers[task.claimedBy]?.name || 'Någon'}</span>`;
            itemClass = 'claimed';
          }
          return `<div class="home-task-item ${itemClass}">
                    <p class="home-task-text">${task.text}</p>${statusHTML}
                  </div>`;
        }).join('') :
        '<p class="no-tasks-message">Inga uppgifter att visa i denna kanal.</p>'
      }
    </div>`;

  homeView.innerHTML = invitesHTML + myChannelsHTML + browseChannelsHTML + dmChannelsHTML + '<hr class="section-divider">' + taskHTML;
}

function renderPinnedMessage() {
  const container = document.getElementById('pinned-message-container');
  const channel = allChannels[currentChannelId];

  const pinnedIds = channel?.pinnedMessageIds || [];

  if (pinnedIds.length > 0) {
    const headerHTML = `
      <div class="pinned-message-header">
        <div>
          <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-push-pin-fill"></use></svg>
          ${pinnedIds.length} fästa meddelanden
        </div>
      </div>`;

    const messagesHTML = pinnedIds.map(msgId => {
      // NYCKELÄNDRING: Leta igenom ALLA meddelanden, inte bara den nuvarande kanalens.
      // Detta är mycket mer robust, särskilt när meddelanden laddas in.
      let msg;
      for (const channelMessages of Object.values(allMessages)) {
        msg = channelMessages.find(m => m.id === msgId);
        if (msg) break;
      }
      if (!msg) return ''; // Hoppa över om meddelandet inte finns
      const user = allUsers[msg.userId] || { name: 'Okänd' };
      return `
        <div class="pinned-message-item">
          <div class="pinned-message-content" role="button" data-msg-id="${msgId}">
            <span class="sender-name">${user.name}:</span> ${msg.text}
          </div>
          <button class="unpin-btn" data-msg-id="${msgId}" title="Lossa meddelande">
            <svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-push-pin-slash"></use></svg>
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${headerHTML}
      <div class="pinned-messages-list">${messagesHTML}</div>`;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}
function renderMessages() {
  const chatView = document.getElementById('chat-view');
  const inputArea = chatView.querySelector('.input-area');
  const pinnedContainer = document.getElementById('pinned-message-container');
  const currentChannel = allChannels[currentChannelId];

  // Om ingen kanal är vald, visa ett tomt läge.
  if (!currentChannelId || !allChannels[currentChannelId]) {
    document.querySelector('.header-title').textContent = 'Ingen kanal vald';
    document.querySelector('.header-member-count').textContent = '';
    chatFeed.innerHTML = '<p class="no-tasks-message">Du har inte gått med i någon kanal ännu. Gå till Hem för att hitta en!</p>';
    inputArea.classList.add('hidden');
    pinnedContainer.classList.add('hidden');
    return;
  }

  // TODO: Funktionalitet för "nya meddelanden"-bubblan är tillfälligt borttagen för felsökning.
  // Kontrollera om användaren är medlem i kanalen.
  const isMember = currentChannel?.members?.includes(currentUserId);
  inputArea.classList.toggle('hidden', !isMember);

  chatFeed.innerHTML = '';

  document.querySelector('.header-title').textContent = allChannels[currentChannelId]?.name || 'Kanal';

  // Om användaren inte är medlem, lägg till ett meddelande om det.
  if (!isMember) {
    chatFeed.innerHTML = '<p class="no-tasks-message">Du är inte medlem i denna kanal. Gå med för att kunna skicka meddelanden.</p>';
  }
  const memberCount = currentChannel?.members?.length || 0;
  const memberText = memberCount === 1 ? '1 medlem' : `${memberCount} medlemmar`;
  document.querySelector('.header-member-count').textContent = memberText;

  renderPinnedMessage();

  const messages = allMessages[currentChannelId] || [];
  const mainThreadMessages = messages.filter(msg => !msg.threadId);
  // Om man inte är medlem, visa inga meddelanden (förutom "gå med"-texten).
  if (!isMember) return;
  // NYTT: Om det inte finns några meddelanden, visa ett välkomstmeddelande.
  // Detta löser också ett layoutproblem där dropdown-menyn klipptes bort i en tom chatt.
  if (mainThreadMessages.length === 0) {
    // Lämna tomt. En CSS-fix med :empty pseudo-klassen hanterar nu layout-buggen.
  } else {
    mainThreadMessages.forEach((msg) => {
      if (typeof msg === 'string') msg = { text: msg, type: 'message', userId: currentUserId, timestamp: new Date() };
      if (!msg.timestamp) msg.timestamp = new Date();
      if (!msg.userId) msg.userId = currentUserId;
      if (!msg.reactions) msg.reactions = {};
      if (!msg.threadId && msg.threadId !== null) msg.threadId = null;
      if (msg.type === 'task' && !('completed' in msg)) msg.completed = false;
      if (msg.claimed === true) { msg.claimedBy = currentUserId; delete msg.claimed; }

      // Hitta originalindexet från den ofiltrerade listan
      const originalIndex = messages.indexOf(msg);
      const messageElement = createMessageElement(msg, originalIndex, 'chat');
      if (messageElement) {
        chatFeed.appendChild(messageElement);
      }
    });
  }

  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function createMessageElement(msg, index, context = 'chat') {
  // Denna funktion är en platshållare. I en mer avancerad implementation
  // skulle denna funktion bygga och returnera ett DOM-element istället för en sträng.
  // Vi skapar en temporär container, renderar meddelandet som en HTML-sträng inuti den,
  // och returnerar sedan det första (och enda) barn-elementet.
  const tempContainer = document.createElement('div');
  // Använd en modifierad version av getSingleMessageHTML som returnerar HTML-strängen
  // istället för att direkt lägga till den i chatFeed.
  const messageHTML = getSingleMessageHTML(msg, index, context);
  if (messageHTML) {
    tempContainer.innerHTML = messageHTML;
  }
  const messageElement = tempContainer.firstChild;

  // NYTT: Om det är en checklista, gör den sorterbar med SortableJS.
  if (messageElement && msg.type === 'checklist') {
    const listElement = messageElement.querySelector('.checklist');
    if (listElement) {
      new Sortable(listElement, {
        animation: 150, // Animationstid i ms
        ghostClass: 'sortable-ghost', // CSS-klass för platshållaren
        handle: '.checklist-item', // Specificera att hela raden är handtaget
        onEnd: function (evt) {
          // Anropa vår nya funktion när användaren har släppt en punkt.
          reorderChecklistItems(msg.id, evt.oldIndex, evt.newIndex);
        }
      });
    }
  }

  return messageElement;
}

// NYTT: En hjälpfunktion som bara genererar HTML-strängen för ett meddelande.
function getSingleMessageHTML(msg, index, context = 'chat') {
    const user = allUsers[msg.userId];
    // FIX: Kontrollera om användaren finns innan vi försöker komma åt dess egenskaper.
    if (!user) {
        console.error(`Användare med ID ${msg.userId} hittades inte för meddelande ${index}`);
        return ''; // Returnera en tom sträng för att undvika krascher.
    }
    const isCurrentUser = msg.userId === currentUserId && msg.type !== 'system';    
    const isThreadReply = !!msg.threadId; // Kollar om meddelandet är ett svar i en tråd
    const containerClasses = `message-container ${isCurrentUser ? 'is-current-user' : ''} ${isThreadReply ? 'thread-reply' : ''}`;
    const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

    // NYTT: Logik för att rendera läskvitton
    let readReceiptHTML = '';
    if (isCurrentUser) {
        const channel = allChannels[currentChannelId];
        const otherMembers = channel.members.filter(id => id !== currentUserId);
        const readers = Object.keys(msg.readBy || {});

        if (otherMembers.every(member => readers.includes(member)) && otherMembers.length > 0) {
            // Alla har läst
            readReceiptHTML = `<span class="read-receipt read-by-all"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-checks"></use></svg></span>`;
        } else if (readers.length > 0) {
            // Någon har läst
            readReceiptHTML = `<span class="read-receipt"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-checks"></use></svg></span>`;
        } else {
            // Bara skickat
            readReceiptHTML = `<span class="read-receipt"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-check"></use></svg></span>`;
        }
    }

    const timestampHTML = `
        <span class="message-timestamp">${time}${msg.editedTimestamp ? ' (redigerat)' : ''}</span>
        ${readReceiptHTML}
    `;

    let messageHTML = '';
    // Om det är ett svar i en tråd, lägg till en anslutningslinje
    let threadLineHTML = isThreadReply ? '<div class="thread-line"></div>' : '';

    let avatarHTML = `<div class="avatar-wrapper" role="button" data-user-id="${msg.userId}">${getAvatarHTML(user)}</div>`;

    if (msg.type === 'system') {
        const actorName = msg.actorId === currentUserId ? 'Du' : (allUsers[msg.actorId]?.name || 'Någon');
        let fullText = `${actorName} ${msg.text}`;
        if (msg.actorId === currentUserId) fullText = fullText.replace(' sig an', ' dig an').replace('har bjudit in', 'bjöd in');
        messageHTML = `<div class="message-container system-message"><p class="message-text">${fullText}</p></div>`;
    } else if (msg.type === 'message' || msg.type === 'task') {
        let claimedByHTML = '';
        let containerExtraClass = '';
        if (msg.type === 'task') {
            // FIX: Se till att alla uppgifter får basklassen .task-message
            containerExtraClass = 'task-message';
            if (msg.completed) {
                containerExtraClass += ' completed-task'; // Lägg till klassen, ersätt inte
                claimedByHTML = `<div class="claimed-by-status">✓ Klart</div>`;
            } else if (msg.claimedBy) {
                const claimedByUser = allUsers[msg.claimedBy] || { name: 'Någon' };
                claimedByHTML = (msg.claimedBy === currentUserId)
                  ? `<button class="complete-task-btn" data-index="${index}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-check-circle"></use></svg>Markera som klar</button>`
                  : `<div class="claimed-by-status">✓ Tagen av ${claimedByUser.name}</div>`;
            } else {
                // Om uppgiften inte är tagen, visa "Jag tar denna"-knappen.
                claimedByHTML = `<button class="task-btn">Jag tar denna!</button>`;
            }
        }
        // NYTT: Logik för trådar
        const threadReplies = allMessages[currentChannelId].filter(reply => reply.threadId === msg.id);
        let threadParticipantsHTML = '';
        if (threadReplies.length > 0 && context !== 'thread') {
            const uniqueRepliers = [...new Set(threadReplies.map(reply => reply.userId))];
            const avatarsToShow = uniqueRepliers.slice(0, 3);
            const remainingCount = uniqueRepliers.length - avatarsToShow.length;

            let avatarHTML = avatarsToShow.map(userId => {
                const user = allUsers[userId];
                if (!user) return '';
                // Använd en mindre version av getAvatarHTML
                if (user.avatarUrl) {
                    return `<img src="${user.avatarUrl}" alt="${user.name}" class="thread-participant-avatar">`;
                } else {
                    return `<div class="avatar-placeholder ${user.colorClass} thread-participant-avatar" style="font-size: 10px;">${user.avatarChar}</div>`;
                }
            }).join('');

            threadParticipantsHTML = `
                <div class="thread-participants" role="button" data-msg-id="${msg.id}">
                    ${avatarHTML}
                    <span class="thread-reply-count">${threadReplies.length} svar${remainingCount > 0 ? ` (+${remainingCount})` : ''}</span>
                </div>
            `;
        }

        const replyButtonHTML = `<button class="reply-btn" data-msg-id="${msg.id}" title="Svara i tråd"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-bend-up-left"></use></svg></button>`;
        const editButtonHTML = isCurrentUser ? `<button class="edit-btn" data-msg-index="${index}" title="Redigera meddelande"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-pencil-simple"></use></svg></button>` : '';
        // FIX: Använd meddelandets ID istället för index för att kontrollera om det är fäst.
        const isPinned = allChannels[currentChannelId]?.pinnedMessageIds?.includes(msg.id);
        const pinIcon = isPinned ? 'ph-push-pin-slash' : 'ph-push-pin';
        const pinTitle = isPinned ? 'Lossa meddelande' : 'Fäst meddelande';
        const pinButtonHTML = `<button class="pin-btn" data-msg-id="${msg.id}" title="${pinTitle}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#${pinIcon}"></use></svg></button>`;
        const existingReactionsHTML = renderReactions(msg, index);
        const addReactionHTML = `<button class="reaction-btn add-reaction-btn" data-msg-index="${index}" title="Lägg till reaktion"><svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-smiley-plus"></use></svg></button>`;
        const footerHTML = (claimedByHTML || threadParticipantsHTML || existingReactionsHTML) ? `<div class="message-footer">${claimedByHTML}${threadParticipantsHTML}${existingReactionsHTML}${addReactionHTML}</div>` : `<div class="message-footer hidden">${addReactionHTML}</div>`;
        
        // NYTT: Använd klasser för bakgrundsfärg istället för inline-style
        const bgColorClass = `bg-${user.colorClass}` || 'bg-default';

        messageHTML = `<div class="${containerClasses} ${containerExtraClass}" data-msg-id="${msg.id}" data-msg-index="${index}" ${isThreadReply ? `data-thread-id="${msg.threadId}"` : ''}>${threadLineHTML}${avatarHTML}<div class="text-block ${bgColorClass}"><div class="message-header"><span class="sender-name">${user.name}</span> ${timestampHTML}${replyButtonHTML}${editButtonHTML}${pinButtonHTML}</div><p class="message-text">${msg.text}</p>${footerHTML}</div></div>`;
    } else if (msg.type === 'checklist') {
        // STEG 1 för checklistor: Rendera en icke-interaktiv lista.
        const itemsWithOriginalIndex = (msg.items || []).map((item, index) => ({ ...item, originalIndex: index }));
        const incompleteItems = itemsWithOriginalIndex.filter(item => !item.completed);
        const completedItems = itemsWithOriginalIndex.filter(item => item.completed);

        const renderItem = (item, index) => `
            <li class="checklist-item ${item.completed ? 'completed' : ''}" data-msg-id="${msg.id}" data-item-index="${item.originalIndex}">
                <span class="checkbox-icon">${item.completed ? '<svg width="18" height="18" viewBox="0 0 256 256"><use href="icons.svg#ph-check-square-fill"></use></svg>' : '<svg width="18" height="18" viewBox="0 0 256 256"><use href="icons.svg#ph-square"></use></svg>'}</span>
                <span class="checklist-item-text">${item.text}</span>
                <button class="delete-item-btn" title="Ta bort punkt"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-x"></use></svg></button>
            </li>
        `;

        let itemsHTML = incompleteItems.map(renderItem).join('');
        if (completedItems.length > 0 && incompleteItems.length > 0) {
            itemsHTML += '<li class="checklist-separator"></li>';
        }
        itemsHTML += completedItems.map(renderItem).join('');

        // KORRIGERING: Lägg till alla standardknappar och funktioner.
        const replyButtonHTML = `<button class="reply-btn" data-msg-id="${msg.id}" title="Svara i tråd"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-bend-up-left"></use></svg></button>`;
        // Redigering av checklistor är mer komplicerat, så vi döljer den knappen för nu.
        const editButtonHTML = ''; 
        const isPinned = allChannels[currentChannelId]?.pinnedMessageIds?.includes(msg.id);
        const pinIcon = isPinned ? 'ph-push-pin-slash' : 'ph-push-pin';
        const pinTitle = isPinned ? 'Lossa meddelande' : 'Fäst meddelande';
        const pinButtonHTML = `<button class="pin-btn" data-msg-id="${msg.id}" title="${pinTitle}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#${pinIcon}"></use></svg></button>`;
        
        const existingReactionsHTML = renderReactions(msg, index);
        const addReactionHTML = `<button class="reaction-btn add-reaction-btn" data-msg-index="${index}" title="Lägg till reaktion"><svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-smiley-plus"></use></svg></button>`;
        const footerHTML = `<div class="message-footer">${existingReactionsHTML}${addReactionHTML}</div>`;
        const bgColorClass = `bg-${user.colorClass}` || 'bg-default';

        // NYTT: Lägg till en "Lägg till punkt"-knapp.
        const addItemHTML = `
            <div id="add-item-container-${msg.id}" class="add-item-container">
                <button class="add-item-btn" data-msg-id="${msg.id}">+ Lägg till punkt</button>
            </div>`;

        messageHTML = `<div class="${containerClasses}" data-msg-id="${msg.id}" data-msg-index="${index}">${threadLineHTML}<div class="avatar-wrapper" role="button" data-user-id="${msg.userId}">${getAvatarHTML(user)}</div><div class="text-block ${bgColorClass}"><div class="message-header"><span class="sender-name">${user.name}</span>${timestampHTML}${replyButtonHTML}${editButtonHTML}${pinButtonHTML}</div><h4 class="checklist-title">${msg.title}</h4><ul class="checklist">${itemsHTML}</ul>${addItemHTML}${footerHTML}</div></div>`;
    } 
    return messageHTML;
}

function openMentionSuggestions(inputElement) {
  closeMentionSuggestions(); // Stäng eventuell befintlig ruta

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel) return;

  const suggestionsBox = document.createElement('div');
  suggestionsBox.className = 'mention-suggestions';
  suggestionsBox.id = 'mention-suggestions';

  const members = currentChannel.members
    .map(id => allUsers[id])
    .filter(Boolean); // Filtrera bort eventuella saknade användare

  if (members.length === 0) return;

  suggestionsBox.innerHTML = members.map(user => `
    <div class="mention-item" data-username="${user.name}">
      ${getAvatarHTML(user)}
      <span>${user.name}</span>
    </div>
  `).join('');

  // Placera rutan i förhållande till input-fältets förälder
  inputElement.parentElement.style.position = 'relative';
  inputElement.parentElement.appendChild(suggestionsBox);

  // Lägg till händelselyssnare för att infoga namn vid klick
  suggestionsBox.addEventListener('click', (e) => {
    const item = e.target.closest('.mention-item');
    if (item) {
      const username = item.dataset.username;
      const text = inputElement.value;
      const atIndex = text.lastIndexOf('@');
      
      // Ersätt den påbörjade @-skrivningen med det fullständiga namnet
      inputElement.value = text.substring(0, atIndex) + `@${username} `;
      inputElement.focus();
      closeMentionSuggestions();
    }
  });
}

function closeMentionSuggestions() {
  const suggestionsBox = document.getElementById('mention-suggestions');
  if (suggestionsBox) {
    // Ta bort position:relative från föräldern
    if (suggestionsBox.parentElement) {
      suggestionsBox.parentElement.style.position = '';
    }
    suggestionsBox.remove();
  }
}

function renderTypeSelectorDropdown() {
  // KORRIGERING: Hämta referensen till dropdown-menyn här, inuti funktionen.
  // Detta garanterar att elementet finns i DOM när koden körs, vilket förhindrar
  // en krasch om skriptet laddas innan HTML-koden är helt analyserad.
  const typeSelectorDropdown = document.getElementById('type-selector-dropdown');
  if (!typeSelectorDropdown) return;

  typeSelectorDropdown.innerHTML = '';
  for (const type in MESSAGE_TYPES) {
    const option = MESSAGE_TYPES[type];
    const button = document.createElement('button');
    button.className = 'type-selector-option';
    button.dataset.value = type;
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#${option.icon}"></use></svg><span>${option.label}</span>`;

    button.addEventListener('click', () => {
      const typeSelectorBtn = document.getElementById('type-selector-btn');
      typeSelectorBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#${option.icon}"></use></svg>`;
      typeSelectorBtn.title = option.label;
      currentMessageType = type;
      typeSelectorDropdown.classList.add('hidden');
    });

    typeSelectorDropdown.appendChild(button);
  }
}

function renderThreadView(parentMsgId) {
  const threadViewContainer = document.getElementById('thread-view-container');
  const parentMsgIndex = allMessages[currentChannelId].findIndex(m => m.id === parentMsgId);
  const parentMsg = allMessages[currentChannelId][parentMsgIndex];
  const replies = allMessages[currentChannelId].filter(m => m.threadId === parentMsgId);

  const navBarHTML = document.querySelector('.nav-bar').outerHTML;
  if (!parentMsg) return;

  // Bygg HTML för hela vyn
  threadViewContainer.innerHTML = `
    <header class="app-header">
      <div class="header-avatar-container">
        <button id="close-thread-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>
      </div>
      <div class="header-channel-info">
        <h2 class="header-title">Tråd</h2>
        <span class="header-member-count">${allChannels[currentChannelId].name}</span>
      </div>
      <div class="header-right-content"></div>
    </header>
    <main class="chat-feed"></main>
    <footer class="input-area">
      <div class="input-pill">
        <input type="text" placeholder="Svara i tråden...">
        <button class="send-btn hidden" aria-label="Skicka">
          <svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-up"></use></svg>
        </button>
      </div>
    </footer>    
    ${navBarHTML}
  `;

  const threadChatFeed = threadViewContainer.querySelector('.chat-feed');

  // Rendera originalmeddelandet
  const parentMsgElement = createMessageElement(parentMsg, parentMsgIndex, 'thread');
  threadChatFeed.appendChild(parentMsgElement);

  // Rendera alla svar
  replies.forEach(reply => {
    const replyIndex = allMessages[currentChannelId].indexOf(reply);
    const replyElement = createMessageElement(reply, replyIndex, 'thread');
    threadChatFeed.appendChild(replyElement);
  });

  // NYTT: Scrolla till botten av tråden
  threadChatFeed.scrollTop = threadChatFeed.scrollHeight;

  // Lägg till händelselyssnare för den nya vyn
  document.getElementById('close-thread-btn').addEventListener('click', closeThreadView);

  const threadInputField = threadViewContainer.querySelector('.input-area input');
  const threadSendBtn = threadViewContainer.querySelector('.send-btn');

  threadInputField.addEventListener('input', () => {
    threadSendBtn.classList.toggle('hidden', threadInputField.value.trim().length === 0);
  });

  const sendReply = () => {
    const text = threadInputField.value.trim();
    if (text === '') return;
    // Anropa den globala sendMessage-funktionen med tråd-ID och en callback
    sendMessage(parentMsgId, text, 'message', (newMessage) => {
      // Denna kod körs efter att meddelandet har sparats
      const replyElement = createMessageElement(newMessage, -1, 'thread'); // Använd -1 för index, då det inte är kritiskt här
      threadChatFeed.appendChild(replyElement);
      allMessages[currentChannelId].push(newMessage); // Lägg till i lokalt state för konsekvens
      replyElement.classList.add('new-message-anim'); // Lägg till animering
      threadChatFeed.scrollTop = threadChatFeed.scrollHeight; // Scrolla ner
    });
    threadInputField.value = '';
    threadSendBtn.classList.add('hidden');
    // NYTT: Rita även om huvud-chattvyn i bakgrunden för att uppdatera avatarer/räknare direkt.
    renderMessages();
  };

  threadSendBtn.addEventListener('click', sendReply);
  threadInputField.addEventListener('keypress', (e) => e.key === 'Enter' && sendReply());
}

function renderTypingIndicator() {
  const channel = allChannels[currentChannelId];
  if (!channel || !channel.typingUsers) {
    typingIndicator.classList.add('hidden');
    return;
  }

  // Hämta alla som skriver, förutom den inloggade användaren själv.
  const typingUserIds = Object.keys(channel.typingUsers).filter(id => id !== currentUserId);

  if (typingUserIds.length === 0) {
    typingIndicator.classList.add('hidden');
  } else {
    const userNames = typingUserIds.map(id => allUsers[id]?.name || 'Någon');
    // Skapa en läsbar sträng, t.ex. "Anna och Bruno skriver" eller "Anna skriver".
    const text = userNames.join(' och ') + (userNames.length > 1 ? ' skriver' : ' skriver');
    typingUserName.textContent = text;
    typingIndicator.classList.remove('hidden');
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
}

function toggleChannelMenu(button) {
  const existingMenu = document.getElementById('channel-menu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'channel-menu';
  menu.className = 'channel-menu';

  const isMuted = currentUser.mutedChannels?.includes(currentChannelId);
  const channel = allChannels[currentChannelId];

  let menuItems = '';
  menuItems += `<button class="channel-menu-item" id="menu-members-btn">Visa medlemmar</button>`;
  // KORRIGERING: Tillåt alltid inbjudningar, oavsett om kanalen är publik eller privat. Det är en "quality of life"-förbättring.
  menuItems += `<button class="channel-menu-item" id="menu-invite-btn">Bjud in till kanal</button>`;
  menuItems += `<button class="channel-menu-item" id="menu-mute-btn">${isMuted ? 'Sätt på ljud' : 'Tysta kanal'}</button>`;
  if (channel && channel.createdBy === currentUserId) {
    menuItems += `<button class="channel-menu-item" id="menu-archive-btn">Arkivera kanal</button>`;
    menuItems += `<button class="channel-menu-item danger" id="menu-delete-btn">Radera kanal...</button>`;
  }
  menuItems += `<button class="channel-menu-item" id="menu-leave-btn">Lämna kanal</button>`;

  menu.innerHTML = menuItems;
  document.body.appendChild(menu);

  const btnRect = button.getBoundingClientRect();
  menu.style.top = `${btnRect.bottom + window.scrollY + 5}px`;
  menu.style.right = `${window.innerWidth - btnRect.right - window.scrollX}px`;

  document.getElementById('menu-members-btn')?.addEventListener('click', () => {
    openMemberListModal();
    closeAllMenus();
  });
  document.getElementById('menu-mute-btn')?.addEventListener('click', () => {
    toggleMuteChannel(currentChannelId);
    closeAllMenus();
  });
  document.getElementById('menu-invite-btn')?.addEventListener('click', () => {
    openInviteModal();
    closeAllMenus();
  });
  document.getElementById('menu-leave-btn')?.addEventListener('click', () => {
    leaveCurrentChannel();
    closeAllMenus();
  });
  document.getElementById('menu-archive-btn')?.addEventListener('click', () => {
    archiveCurrentChannel();
    closeAllMenus();
  });
  document.getElementById('menu-delete-btn')?.addEventListener('click', () => {
    deleteCurrentChannel();
    closeAllMenus();
  });
}

function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  const userList = document.getElementById('invite-user-list');
  userList.innerHTML = '';

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel) return;

  // KORRIGERING: Filtrera bort befintliga medlemmar.
  // Se till att Kollegabot (user2) alltid är ett alternativ om den inte redan är medlem.
  const usersToInvite = Object.keys(allUsers).filter(userId =>
    !currentChannel.members.includes(userId)
  );

  if (usersToInvite.length === 0) {
    userList.innerHTML = '<p class="no-tasks-message">Alla användare är redan med i kanalen.</p>';
  } else {
    usersToInvite.forEach(userId => {
      const user = allUsers[userId];
      userList.insertAdjacentHTML('beforeend', `
        <div class="invite-user-item">
          ${getAvatarHTML(user)}
          <span class="invite-user-name">${user.name}</span>
          <button class="invite-btn" data-user-id="${userId}">Bjud in</button>
        </div>
      `);
    });
  }

  modal.classList.remove('hidden');
}

function closeInviteModal() {
  document.getElementById('invite-modal').classList.add('hidden');
}

function openMemberListModal() {
  const modal = document.getElementById('member-list-modal');
  const memberListBody = document.getElementById('member-list-body');
  memberListBody.innerHTML = '';

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel || !currentChannel.members) return;

  currentChannel.members.forEach(userId => {
    const user = allUsers[userId];
    if (user) {
      memberListBody.insertAdjacentHTML('beforeend', `
        <div class="member-list-item">
          ${getAvatarHTML(user)}
          <span class="member-list-name">${user.name}</span>
        </div>
      `);
    }
  });

  modal.classList.remove('hidden');
}

function closeMemberListModal() {
  document.getElementById('member-list-modal').classList.add('hidden');
}

function openCreateChannelModal() {
  const modal = document.getElementById('create-channel-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  document.getElementById('channel-name-input').focus();

  // --- Koppla lyssnare för stängning ---
  const closeBtn = document.getElementById('create-channel-close-btn');
  const form = document.getElementById('create-channel-form');

  // Stäng när man klickar på (X)
  closeBtn.onclick = () => closeCreateChannelModal();

  // Stäng när man klickar utanför innehållet
  modal.onclick = (event) => {
    if (event.target === modal) {
      closeCreateChannelModal();
    }
  };
}

function closeCreateChannelModal() {
  const modal = document.getElementById('create-channel-modal');
  modal.classList.add('hidden');
  document.getElementById('create-channel-form').reset();
}

function updateHeader(viewId, data) {
  const headerLeftContent = document.getElementById('header-left-content');
  const headerTitle = document.querySelector('.header-title');
  const headerRightContent = document.getElementById('header-right-content');
  const headerMemberCount = document.querySelector('.header-member-count');
  const channelInfo = document.querySelector('.header-channel-info');

  headerRightContent.innerHTML = '';
  headerMemberCount.style.display = 'none';
  channelInfo.style.cursor = 'default';
  
  if (viewId === 'chat-view') {
    renderMessages(); // Uppdatera innehållet
    channelInfo.style.cursor = 'pointer';
    headerTitle.textContent = allChannels[currentChannelId]?.name || 'Kanal';
    headerMemberCount.style.display = 'block';
    if (currentChannelId) {
      headerRightContent.innerHTML = `<button id="channel-menu-btn" class="header-action-btn" title="Kanalalternativ"><svg width="22" height="22" viewBox="0 0 256 256"><use href="icons.svg#ph-dots-three-outline-vertical"></use></svg></button>`;
      // KOPPLA LYSSNARE DIREKT: Koppla lyssnaren för kanalmenyn här.
      document.getElementById('channel-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChannelMenu(e.currentTarget);
      });
    }
    headerLeftContent.innerHTML = `<button id="back-to-home-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    // KOPPLA LYSSNARE DIREKT: Koppla lyssnaren för "tillbaka till hem" här.
    document.getElementById('back-to-home-btn').addEventListener('click', () => switchView('home-view'));
  } else if (viewId === 'profile-view') {
    renderProfileView(data || currentUserId); // Uppdatera innehållet
    headerTitle.textContent = 'Profil';
    headerLeftContent.innerHTML = `<button id="back-to-chat-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    // KOPPLA LYSSNARE DIREKT: Koppla lyssnaren för "tillbaka till chatt" här.
    document.getElementById('back-to-chat-btn').addEventListener('click', () => {
      // Om vi var i en trådvy, stäng den. Annars, gå till chattvyn.
      if (document.getElementById('chat-view').dataset.activeThreadId) {
        closeThreadView();
      } else {
        switchView('chat-view');
      }
    });
  } else if (viewId === 'home-view') {
    renderHomeView(); // Uppdatera innehållet
    headerTitle.textContent = 'Kanaler';
    const user = allUsers[currentUserId]; // FIX: Använd den uppdaterade datan från minnet
    headerLeftContent.innerHTML = `<div class="avatar-wrapper" role="button" data-user-id="${user.id}">${getAvatarHTML(user)}</div>`;
    // NYTT: Lägg till en inställningsknapp (kugghjul) i hemvyn.
    headerRightContent.innerHTML = `<button id="settings-btn" class="header-action-btn" title="Inställningar"><svg width="24" height="24" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-gear-fill"></use></svg></button>`;
    // KOPPLA LYSSNARE DIREKT: Koppla lyssnaren för inställningsknappen.
    document.getElementById('settings-btn').addEventListener('click', () => {
      switchView('settings-view');
    });
  } else if (viewId === 'settings-view') {
    renderSettingsView(); // Uppdatera innehållet
    headerTitle.textContent = 'Inställningar';
    headerLeftContent.innerHTML = `<button id="back-to-home-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    document.getElementById('back-to-home-btn').addEventListener('click', () => switchView('home-view'));
  }
}