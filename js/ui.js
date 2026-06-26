// =================================================================
// UI.JS
// Ansvarar för all rendering och DOM-manipulation.
// =================================================================

const chatFeed = document.querySelector('.chat-feed');
const typeSelectorDropdown = document.getElementById('type-selector-dropdown');
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

function renderProfileView(userId) {
  const profileView = document.getElementById('profile-view');
  const isOwnProfile = !userId || userId === currentUserId;
  const userToView = isOwnProfile ? JSON.parse(localStorage.getItem('currentUser')) : allUsers[userId];

  if (!userToView) return;

  const status = calculateStatus(userToView.lastSeen, userToView.doNotDisturb);

  profileView.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar-wrapper">
        <div class="avatar-placeholder ${userToView.colorClass}">${userToView.avatarChar}</div>
        <div class="status-indicator ${status.key}"></div>
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

function renderHomeView() {
  const homeView = document.getElementById('home-view');
  const loggedInUser = JSON.parse(localStorage.getItem('currentUser'));
  const userChannels = loggedInUser?.channels || [];

  const myChannelsHTML = `
    <div class="channel-list">
      <h3>Dina kanaler</h3>
      ${userChannels.some(id => allChannels[id] && !allChannels[id].isDM) ?
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
      ${Object.keys(allChannels).some(id => !userChannels.includes(id) && allChannels[id].isPublic) ?
        Object.keys(allChannels).map(id => {
          if (userChannels.includes(id) || !allChannels[id].isPublic) return '';
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

  homeView.innerHTML = myChannelsHTML + browseChannelsHTML + dmChannelsHTML + '<hr class="section-divider">' + taskHTML;
}

function renderSingleMessage(msg, index) {
  const user = allUsers[msg.userId] || allUsers[currentUserId];
  const isCurrentUser = msg.userId === currentUserId;
  const containerClasses = `message-container ${isCurrentUser ? 'is-current-user' : ''}`;
  const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const timestampHTML = `<span class="message-timestamp">${time}</span>`;

  let messageHTML = '';
  let avatarHTML = `
    <div class="avatar-wrapper" role="button" data-user-id="${msg.userId}">
      <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
    </div>
  `;

  if (msg.type === 'system') {
    const actorName = msg.actorId === currentUserId ? 'Du' : (allUsers[msg.actorId]?.name || 'Någon');
    let fullText = `${actorName} ${msg.text}`;
    if (msg.actorId === currentUserId) fullText = fullText.replace(' sig an', ' dig an');
    messageHTML = `<div class="message-container system-message"><p class="message-text">${fullText}</p></div>`;
  } else if (msg.type === 'task' && !msg.claimedBy) {
    messageHTML = `
      <div class="${containerClasses} task-message" data-index="${index}">
        ${avatarHTML}
        <div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};">
          <div class="message-header"><span class="sender-name">${user.name}</span> ${timestampHTML}</div>
          <p class="message-text">${msg.text}</p>
          <button class="task-btn">Jag tar denna!</button>
        </div>
      </div>
    `;
  } else {
    let claimedByHTML = '';
    let containerExtraClass = '';
    if (msg.type === 'task') {
      if (msg.completed) {
        containerExtraClass = 'completed-task';
        claimedByHTML = `<div class="claimed-by-status">✓ Klart</div>`;
      } else if (msg.claimedBy) {
        const claimedByUser = allUsers[msg.claimedBy] || { name: 'Någon' };
        claimedByHTML = (msg.claimedBy === currentUserId)
          ? `<button class="complete-task-btn" data-index="${index}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-check-circle"></use></svg>Markera som klar</button>`
          : `<div class="claimed-by-status">✓ Tagen av ${claimedByUser.name}</div>`;
      }
    }
    // NYTT: Lägg till en knapp för att fästa meddelandet.
    const pinButtonHTML = `<button class="pin-btn" data-msg-index="${index}" title="Fäst meddelande">
        <svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-push-pin"></use></svg>
      </button>`;
    const existingReactionsHTML = renderReactions(msg, index);
    const addReactionHTML = `<button class="reaction-btn add-reaction-btn" data-msg-index="${index}" title="Lägg till reaktion"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-smiley-plus"></use></svg></button>`;
    // Skapa alltid en footer som innehåller reaktionerna.
    // Om det finns status för uppgiften (claimedByHTML), lägg till det också.
    const footerHTML = `
      <div class="message-footer">
        ${claimedByHTML}
        ${existingReactionsHTML}
        ${addReactionHTML}
      </div>`;
    messageHTML = `<div class="${containerClasses} ${containerExtraClass}">${avatarHTML}<div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};"><div class="message-header"><span class="sender-name">${user.name}</span> ${timestampHTML}${pinButtonHTML}</div><p class="message-text">${msg.text}</p>${footerHTML}</div></div>`;
  }
  chatFeed.insertAdjacentHTML('beforeend', messageHTML);
}

function renderPinnedMessage() {
  const container = document.getElementById('pinned-message-container');
  const channel = allChannels[currentChannelId];

  if (channel && channel.pinnedMessageIndex !== null && channel.pinnedMessageIndex !== undefined) {
    const msg = allMessages[currentChannelId][channel.pinnedMessageIndex];
    if (!msg) { // Om meddelandet har raderats
      container.classList.add('hidden');
      return;
    }
    const user = allUsers[msg.userId] || { name: 'Okänd' };

    container.innerHTML = `
      <div class="pinned-message-header">
        <div>
          <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-push-pin-fill"></use></svg>
          Fäst meddelande
        </div>
        <button id="unpin-btn" title="Lossa meddelande">&times;</button>
      </div>
      <div class="pinned-message-content" role="button" data-msg-index="${channel.pinnedMessageIndex}">
        <span class="sender-name">${user.name}:</span> ${msg.text}
      </div>
    `;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}
function renderMessages() {
  chatFeed.innerHTML = '';

  document.querySelector('.header-title').textContent = allChannels[currentChannelId]?.name || 'Kanal';

  const currentChannel = allChannels[currentChannelId];
  const memberCount = currentChannel?.members?.length || 0;
  const memberText = memberCount === 1 ? '1 medlem' : `${memberCount} medlemmar`;
  document.querySelector('.header-member-count').textContent = memberText;

  // NYTT: Rendera det fästa meddelandet
  renderPinnedMessage();

  const messages = allMessages[currentChannelId] || [];
  messages.forEach((msg, index) => {
    // Migrera gamla data vid behov
    if (typeof msg === 'string') msg = { text: msg, type: 'message', userId: currentUserId, timestamp: new Date() };
    if (!msg.timestamp) msg.timestamp = new Date();
    if (!msg.userId) msg.userId = currentUserId;
    if (!msg.reactions) msg.reactions = {};
    if (msg.type === 'task' && !('completed' in msg)) msg.completed = false;
    if (msg.claimed === true) { msg.claimedBy = currentUserId; delete msg.claimed; }

    renderSingleMessage(msg, index);
  });

  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function createMessageElement(msg, index) {
  // Denna funktion är en platshållare. I en mer avancerad implementation
  // skulle denna funktion bygga och returnera ett DOM-element istället för en sträng.
  // Vi skapar en temporär container, renderar meddelandet som en HTML-sträng inuti den,
  // och returnerar sedan det första (och enda) barn-elementet.
  const tempContainer = document.createElement('div');
  // Använd en modifierad version av renderSingleMessage som returnerar HTML-strängen
  // istället för att direkt lägga till den i chatFeed.
  const messageHTML = getSingleMessageHTML(msg, index);
  if (messageHTML) {
    tempContainer.innerHTML = messageHTML;
    return tempContainer.firstChild;
  }
  return tempContainer.firstChild;
}

chatFeed.addEventListener('click', function(event) {
  const pinBtn = event.target.closest('.pin-btn');
  if (pinBtn) {
    togglePinMessage(parseInt(pinBtn.dataset.msgIndex, 10));
  }
});

// NYTT: En hjälpfunktion som bara genererar HTML-strängen för ett meddelande.
function getSingleMessageHTML(msg, index) {
    const user = allUsers[msg.userId] || allUsers[currentUserId];
    // FIX: Kontrollera om användaren finns innan vi försöker komma åt dess egenskaper.
    if (!user) {
        console.error(`Användare med ID ${msg.userId} hittades inte för meddelande ${index}`);
        return ''; // Returnera en tom sträng för att undvika krascher.
    }
    const isCurrentUser = msg.userId === currentUserId && msg.type !== 'system';    
    const isThreadReply = msg.threadId !== null;
    const containerClasses = `message-container ${isCurrentUser ? 'is-current-user' : ''} ${isThreadReply ? 'thread-reply' : ''}`;
    const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const timestampHTML = `<span class="message-timestamp">${time}${msg.editedTimestamp ? ' (redigerat)' : ''}</span>`;

    let messageHTML = '';
    // NYTT: Om det är ett svar i en tråd, lägg till en anslutningslinje
    let threadLineHTML = isThreadReply ? '<div class="thread-line"></div>' : '';

    let avatarHTML = `
    <div class="avatar-wrapper" role="button" data-user-id="${msg.userId}">
      <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
    </div>
  `;

    if (msg.type === 'system') {
        const actorName = msg.actorId === currentUserId ? 'Du' : (allUsers[msg.actorId]?.name || 'Någon');
        let fullText = `${actorName} ${msg.text}`;
        if (msg.actorId === currentUserId) fullText = fullText.replace(' sig an', ' dig an').replace('har bjudit in', 'bjöd in');
        messageHTML = `<div class="message-container system-message"><p class="message-text">${fullText}</p></div>`;
    } else if (msg.type === 'task' && !msg.claimedBy) {
        messageHTML = `
      <div class="${containerClasses} task-message" data-index="${index}">
        ${avatarHTML}
        <div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};">
          <div class="message-header"><span class="sender-name">${user.name}</span> ${timestampHTML}</div>
          <p class="message-text">${msg.text}</p>
          <button class="task-btn">Jag tar denna!</button>
        </div>
      </div>
    `;
    } else {
        let claimedByHTML = '';
        let containerExtraClass = '';
        if (msg.type === 'task') {
            if (msg.completed) {
                containerExtraClass = 'completed-task';
                claimedByHTML = `<div class="claimed-by-status">✓ Klart</div>`;
            } else if (msg.claimedBy) {
                const claimedByUser = allUsers[msg.claimedBy] || { name: 'Någon' };
                claimedByHTML = (msg.claimedBy === currentUserId)
                  ? `<button class="complete-task-btn" data-index="${index}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-check-circle"></use></svg>Markera som klar</button>`
                  : `<div class="claimed-by-status">✓ Tagen av ${claimedByUser.name}</div>`;
            }
        }
        // NYTT: Logik för trådar
        const threadReplies = allMessages[currentChannelId].filter(reply => reply.threadId === msg.id);
        const threadReplyCount = threadReplies.length;
        const threadLinkHTML = threadReplyCount > 0 
            ? `<button class="thread-link" data-msg-id="${msg.id}">${threadReplyCount} svar</button>` 
            : '';

        const replyButtonHTML = `<button class="reply-btn" data-msg-id="${msg.id}" title="Svara i tråd"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-bend-up-left"></use></svg></button>`;
        const editButtonHTML = isCurrentUser ? `<button class="edit-btn" data-msg-index="${index}" title="Redigera meddelande"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-pencil-simple"></use></svg></button>` : '';
        const pinButtonHTML = `<button class="pin-btn" data-msg-index="${index}" title="Fäst meddelande"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-push-pin"></use></svg></button>`;
        const existingReactionsHTML = renderReactions(msg, index);
        const addReactionHTML = `<button class="reaction-btn add-reaction-btn" data-msg-index="${index}" title="Lägg till reaktion"><svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><use href="icons.svg#ph-smiley-plus"></use></svg></button>`;
        const footerHTML = `<div class="message-footer">${claimedByHTML}${threadLinkHTML}${existingReactionsHTML}${addReactionHTML}</div>`;
        
        // NYTT: Lade till replyButtonHTML i headern och data-msg-id på containern
        messageHTML = `<div class="${containerClasses} ${containerExtraClass}" data-msg-id="${msg.id}" data-msg-index="${index}">${threadLineHTML}${avatarHTML}<div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};"><div class="message-header"><span class="sender-name">${user.name}</span> ${timestampHTML}${replyButtonHTML}${editButtonHTML}${pinButtonHTML}</div><p class="message-text">${msg.text}</p>${footerHTML}</div></div>`;
    }
    return messageHTML;
}

function renderTypeSelectorDropdown() {
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

function showTypingIndicator(userName) {
  typingUserName.textContent = `${userName} skriver`;
  typingIndicator.classList.remove('hidden');
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function hideTypingIndicator() {
  typingIndicator.classList.add('hidden');
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

  const user = JSON.parse(localStorage.getItem('currentUser'));
  const isMuted = user.mutedChannels?.includes(currentChannelId);

  let menuItems = '';
  menuItems += `<button class="channel-menu-item" id="menu-members-btn">Visa medlemmar</button>`;
  if (!allChannels[currentChannelId]?.isPublic) {
    menuItems += `<button class="channel-menu-item" id="menu-invite-btn">Bjud in till kanal</button>`;
  }
  menuItems += `<button class="channel-menu-item" id="menu-mute-btn">${isMuted ? 'Sätt på ljud' : 'Tysta kanal'}</button>`;
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
}

function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  const userList = document.getElementById('invite-user-list');
  userList.innerHTML = '';

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel) return;

  const usersToInvite = Object.keys(allUsers).filter(userId =>
    !currentChannel.members.includes(userId) && userId !== 'user2'
  );

  if (usersToInvite.length === 0) {
    userList.innerHTML = '<p class="no-tasks-message">Alla användare är redan med i kanalen.</p>';
  } else {
    usersToInvite.forEach(userId => {
      const user = allUsers[userId];
      userList.insertAdjacentHTML('beforeend', `
        <div class="invite-user-item">
          <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
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
          <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
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
    renderMessages();
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
    renderProfileView(data);
    headerTitle.textContent = 'Profil';
    headerLeftContent.innerHTML = `<button id="back-to-chat-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    // KOPPLA LYSSNARE DIREKT: Koppla lyssnaren för "tillbaka till chatt" här.
    document.getElementById('back-to-chat-btn').addEventListener('click', () => switchView('chat-view'));
  } else if (viewId === 'home-view') {
    renderHomeView();
    headerTitle.textContent = 'Kanaler';
    const user = allUsers[currentUserId];
    headerLeftContent.innerHTML = `<div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>`;
  }
}