const sendBtn = document.querySelector('.send-btn');
const inputField = document.querySelector('.input-area input');
const chatFeed = document.querySelector('.chat-feed');
// NYTT: Uppdaterade referenser för den nya dropdown-knappen
const typeSelectorBtn = document.getElementById('type-selector-btn');
const typeSelectorDropdown = document.getElementById('type-selector-dropdown');
const typingIndicator = document.getElementById('typing-indicator');
const typingUserName = document.getElementById('typing-user-name');
let typingTimeout;
let currentMessageType = 'message'; // Startvärde

// Steg 1: Hämta inloggad användare från minnet
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

// Steg 2: Om ingen användare är inloggad, skicka tillbaka till login.html
if (!currentUser) {
  window.location.href = 'login.html';
}

// Steg 3: Läs in ALLA användare från minnet, eller starta med bara den inloggade
let allUsers = JSON.parse(localStorage.getItem('allUsers')) || { [currentUser.id]: currentUser };
const currentUserId = currentUser.id;

// NYTT: Säkerställ att Kollegabot finns och är korrekt sparad
if (!allUsers['user2']) {
  allUsers['user2'] = {
    name: 'Kollegabot',
    avatarChar: '🤖',
    colorClass: 'magenta',
    channels: [],
    statusMessage: 'Jag är en hjälpsam bot!'
  };
  // Spara direkt så att boten blir permanent
  localStorage.setItem('allUsers', JSON.stringify(allUsers));
}


// NYTT: Definiera våra meddelandetyper med ikoner
const MESSAGE_TYPES = {
  'message': { label: 'Meddelande', icon: 'ph-chat' },
  'task': { label: 'Uppgift', icon: 'ph-check-square' }
};

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔'];

// Färgpalett för användare och meddelanden
const USER_COLORS = {
  'cyan': '#e7f3fa',
  'magenta': '#fce8ef',
  'green': '#eaf4e8',
  'orange': '#fef3e7'
};

// NYTT: Definiera kanaler och meddelandestruktur
const channels = {}; // Töm listan med standardkanaler

// Hämta den senast valda kanalen, eller välj den första som standard
let currentChannelId = localStorage.getItem('currentChannelId'); // Ta inte en standardkanal
if (!currentChannelId && Object.keys(channels).length > 0) {
  currentChannelId = Object.keys(channels)[0]; // Välj bara första om det finns någon
}


// Läs in ALLA meddelanden från minnet
let allMessages = JSON.parse(localStorage.getItem('chatMessages')) || { 'ch1': [], 'ch2': [] };
// Säkerställ att meddelandearray finns för varje kanal
Object.keys(channels).forEach(chId => {
  if (!channels[chId].members) channels[chId].members = ['user2', currentUser.id]; // Se till att alla kanaler har medlemmar
}); // Denna loop kommer inte köras om channels är tom, vilket är korrekt.


 
// Läs in ALLA kanaler från minnet, eller använd standard
let allChannels = JSON.parse(localStorage.getItem('allChannels')) || channels;
Object.keys(allChannels).forEach(chId => { if (!allMessages[chId]) allMessages[chId] = []; });
// Säkerställ att alla kanaler har en medlemslista
Object.keys(allChannels).forEach(chId => {
  if (!allChannels[chId].members) allChannels[chId].members = [];
});

function updateLastSeen() {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.lastSeen = new Date().toISOString();
  localStorage.setItem('currentUser', JSON.stringify(user));
}

function calculateStatus(lastSeen, doNotDisturb) {
  // FIX: Stör ej ska visas oavsett senaste aktivitet
  if (doNotDisturb) return { text: 'Stör ej', key: 'dnd' };

  if (!lastSeen) return { text: 'Inaktiv', key: 'inactive' };

  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffMinutes = (now - lastSeenDate) / (1000 * 60);

  if (diffMinutes < 5) {
    return { text: 'Aktiv nu', key: 'active' };
  }
  if (diffMinutes < 30) {
    const minutes = Math.round(diffMinutes);
    return { text: `Sågs för ${minutes} min sedan`, key: 'away' };
  }
  return { text: 'Inaktiv', key: 'inactive' };
}

function closeAllEmojiPickers() {
  const pickers = document.querySelectorAll('.emoji-picker');
  pickers.forEach(picker => picker.remove());
}

function closeAllMenus() {
  closeAllEmojiPickers();
  const channelMenu = document.getElementById('channel-menu');
  if (channelMenu) channelMenu.remove();
}

function openEmojiPicker(button) {
  closeAllEmojiPickers(); // Stäng alla andra öppna menyer först

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

  // Positionera menyn neråt och vänsterjusterat från knappen
  const btnRect = button.getBoundingClientRect();
  picker.style.left = `${btnRect.right + window.scrollX - picker.offsetWidth}px`;
  picker.style.top = `${btnRect.bottom + window.scrollY + 10}px`; // 10px marginal
}

function renderReactions(msg, msgIndex) {
  const reactions = msg.reactions || {};
  const reactionKeys = Object.keys(reactions);

  // Starta med en tom behållare. Lägg till 'has-reactions' om det finns några.
  let reactionsHTML = `<div class="reactions-container ${reactionKeys.length > 0 ? 'has-reactions' : ''}">`;

  // 1. Loopa igenom och rendera alla befintliga reaktioner först.
  if (reactionKeys.length > 0) {
    reactionKeys.forEach(emoji => {
      const count = reactions[emoji].length;
      reactionsHTML += `<button class="reaction-btn existing-reaction" data-msg-index="${msgIndex}" data-emoji="${emoji}">${emoji} ${count}</button>`;
    });
  }

  // 2. Lägg till "lägg till"-knappen sist, så den hamnar längst till höger.
  reactionsHTML += `<button class="reaction-btn add-reaction-btn" data-msg-index="${msgIndex}" title="Lägg till reaktion"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-smiley-plus"></use></svg></button>`;
  return reactionsHTML + '</div>';
}

function renderProfileView(userId) {
  const profileView = document.getElementById('profile-view');
  const isOwnProfile = !userId || userId === currentUserId;
  const userToView = isOwnProfile ? JSON.parse(localStorage.getItem('currentUser')) : allUsers[userId];

  if (!userToView) return; // Avbryt om användaren inte finns

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
    <!-- NYTT: Behållare för statusmeddelande -->
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
          // Hitta alla uppgifter som är tagna av den inloggade användaren men inte slutförda
          const myTasks = Object.values(allMessages).flat().filter(msg => msg.type === 'task' && msg.claimedBy === currentUserId && !msg.completed);
          if (myTasks.length === 0) {
            return '<p class="no-tasks-message">Du har inga pågående uppgifter.</p>';
          }
          let taskHTML = '';
          myTasks.forEach(task => {
            // Hitta kanalnamnet för uppgiften
            const channelName = allChannels[Object.keys(allMessages).find(key => allMessages[key].includes(task))]?.name || '';
            taskHTML += `
              <div class="home-task-item claimed">
                <p class="home-task-text">${task.text}</p>
                <span class="home-task-status">${channelName}</span>
              </div>
            `;
          });
          return taskHTML;
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
    ` : `
      <!-- FIX: Knapp för att starta ett DM saknades helt, lyssnaren fanns men inte knappen -->
      <div class="profile-actions">
        <button id="send-dm-btn" class="primary-action-btn" data-user-id="${userId}">
          <svg width="18" height="18" viewBox="0 0 256 256"><use href="icons.svg#ph-paper-plane-tilt"></use></svg>
          Skicka meddelande
        </button>
      </div>
    `}
  `;
}

function renderHomeView() {
  const homeView = document.getElementById('home-view');
  const loggedInUser = JSON.parse(localStorage.getItem('currentUser')); // FIX: Hämta användaren från minnet
  let finalHTML = '';

  // Del 1: Rendera vanliga kanaler
  const userChannels = loggedInUser?.channels || [];
  let myChannelsHTML = '<div class="channel-list"><h3>Dina kanaler</h3>';
  let hasRegularChannels = false;
  userChannels.forEach(channelId => {
    const channel = allChannels[channelId];
    if (channel && !channel.isDM) { // Visa bara vanliga kanaler här
      hasRegularChannels = true;
      const isActive = channelId === currentChannelId ? 'active' : '';
      myChannelsHTML += `
        <button class="channel-list-item ${isActive}" data-channel-id="${channelId}">${!channel.isPublic ? `
          <svg class="private-channel-icon" viewBox="0 0 256 256">
            <use href="icons.svg#ph-lock"></use>
          </svg>
        ` : ''}
          <span>${channel.name}</span>
        </button>
      `;
    }
  });
  if (!hasRegularChannels) {
    myChannelsHTML += '<p class="no-tasks-message">Du har inte gått med i några kanaler än.</p>';
  }
  myChannelsHTML += '</div>';
  finalHTML += myChannelsHTML;

  // Del 1.8: Bläddra bland kanaler
  let browseChannelsHTML = '<div class="channel-list"><h3>Bläddra bland kanaler</h3>';
  let hasChannelsToBrowse = false;
  for (const channelId in allChannels) {
    if (!userChannels.includes(channelId) && allChannels[channelId].isPublic) {
      hasChannelsToBrowse = true;
      const channel = allChannels[channelId];
      browseChannelsHTML += `
        <div class="channel-list-item">
          <span>${channel.name}</span>
          <button class="join-channel-btn" data-channel-id="${channelId}">Gå med</button>
        </div>
      `;
    }
  }
  if (!hasChannelsToBrowse) {
    browseChannelsHTML += '<p class="no-tasks-message">Inga fler kanaler att gå med i.</p>';
  }
  browseChannelsHTML += '<button class="create-channel-btn" id="create-channel-btn">+ Skapa kanal</button>';
  browseChannelsHTML += '</div>';
  finalHTML += browseChannelsHTML;

  // Del 1.5: Rendera Direktmeddelanden (DM)
  let dmChannelsHTML = '<div class="channel-list"><h3>Direktmeddelanden</h3>';
  let hasDMs = false;
  userChannels.forEach(channelId => {
    const channel = allChannels[channelId];
    if (channel && channel.isDM) {
      hasDMs = true;
      const isActive = channelId === currentChannelId ? 'active' : '';
      // Hitta den andra användaren i DM-kanalen
      const otherUserId = channel.members.find(id => id !== currentUserId);
      const otherUser = allUsers[otherUserId] || { name: 'Okänd' };
      dmChannelsHTML += `
        <button class="channel-list-item ${isActive}" data-channel-id="${channelId}">
          <span>${otherUser.name}</span>
        </button>
      `;
    }
  });
  if (!hasDMs) {
    dmChannelsHTML += '<p class="no-tasks-message">Du har inga direktmeddelanden.</p>';
  }
  dmChannelsHTML += '</div>';
  finalHTML += dmChannelsHTML;


  // Del 2: Separator och uppgiftslista
  finalHTML += '<hr class="section-divider">';
  let taskHTML = '<div class="home-task-list">';
  // FIX: Visa uppgifter för den aktiva kanalen och uppdatera rubriken
  taskHTML += `<h3>Uppgifter i ${allChannels[currentChannelId]?.name || ''}</h3>`;

  // FIX: Hämta bara uppgifter från den nuvarande kanalen
  const channelTasks = (allMessages[currentChannelId] || []).filter(msg => msg.type === 'task');

  if (channelTasks.length > 0) {
    channelTasks.forEach(task => {
      let statusHTML = '';
      let itemClass = '';
      if (task.completed) {
        statusHTML = `<span class="home-task-status">✓ Klart</span>`;
        itemClass = 'completed';
      } else if (task.claimedBy) {
        const claimedBy = allUsers[task.claimedBy]?.name || 'Någon';
        statusHTML = `<span class="home-task-status">Tagen av ${claimedBy}</span>`;
        itemClass = 'claimed';
      }
      taskHTML += `
        <div class="home-task-item ${itemClass}">
          <p class="home-task-text">${task.text}</p>${statusHTML}
        </div>
      `;
    });
  } else {
    taskHTML += '<p class="no-tasks-message">Inga uppgifter att visa i denna kanal.</p>';
  }
  taskHTML += '</div>';
  finalHTML += taskHTML;

  homeView.innerHTML = finalHTML;
}

function renderMessages() {
  chatFeed.innerHTML = '';

  // Behåll sidans titel (kan ändras senare när vi bygger ut tabbarna)
  document.querySelector('.header-title').textContent = allChannels[currentChannelId]?.name || 'Kanal';

  // NYTT: Uppdatera medlemsantal
  const currentChannel = allChannels[currentChannelId];
  const memberCount = currentChannel?.members?.length || 0;
  const memberText = memberCount === 1 ? '1 medlem' : `${memberCount} medlemmar`;

  document.querySelector('.header-channel-info').style.cursor = 'pointer'; // Gör den klickbar
  document.querySelector('.header-member-count').textContent = memberText;

  const messages = allMessages[currentChannelId] || []; // Hämta meddelanden, säkerställ att det är en array
  messages.forEach(function(msg, index) {
    // Uppdaterar gamla meddelanden och lägger till en standardanvändare om det saknas
    // och lägger till en tidsstämpel om den saknas.
    if (typeof msg === 'string') {
      msg = { text: msg, type: 'message', claimed: false, userId: currentUserId, timestamp: new Date() };
    }
    if (msg.type === 'task' && !('completed' in msg)) msg.completed = false; // Lägg till completed-fältet
    if (msg.claimed === true) { msg.claimedBy = currentUserId; msg.claimed = false; } // Migrera gamla data
    if (!msg.reactions) msg.reactions = {}; // Se till att alla meddelanden har ett reaktionsobjekt
    if (!msg.userId) msg.userId = currentUserId;
    if (!msg.timestamp) msg.timestamp = new Date(); // Fallback för gamla meddelanden

    const user = allUsers[msg.userId] || allUsers[currentUserId]; // Hämta användarinfo
    const isCurrentUser = msg.userId === currentUserId;
    const containerClasses = `message-container ${isCurrentUser ? 'is-current-user' : ''}`;
    const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const timestampHTML = `<span class="message-timestamp">${time}</span>`;

    let messageHTML = '';
    
    // Vi bygger avataren.
    let avatarHTML = `
      <div class="avatar-wrapper" role="button" data-user-id="${msg.userId}">
        <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
      </div>
    `;

    // 1. Om det är en UPPGIFT som INTE ÄR TAGEN ännu
    if (msg.type === 'system') {
      const actorName = msg.actorId === currentUserId ? 'Du' : (allUsers[msg.actorId]?.name || 'Någon');
      let fullText = `${actorName} ${msg.text}`;
      if (msg.actorId === currentUserId) fullText = fullText.replace(' sig an', ' dig an');
      messageHTML = `<div class="message-container system-message"><p class="message-text">${fullText}</p></div>`;
    }
    else if (msg.type === 'task' && !msg.claimedBy) {
      messageHTML = `
        <div class="${containerClasses} task-message" data-index="${index}">
          ${avatarHTML}
          <div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};">
            <div class="message-header">
              <span class="sender-name">${user.name}</span> ${timestampHTML}
            </div>
            <p class="message-text">${msg.text}</p>
            <button class="task-btn">Jag tar denna!</button>
          </div>
        </div>
      `;
    } 
    // 2. Om det är ett vanligt meddelande ELLER en uppgift som är tagen
    else {
      let claimedByHTML = '';
      let containerExtraClass = '';
      if (msg.type === 'task') {
        if (msg.completed) {
          containerExtraClass = 'completed-task';
          claimedByHTML = `<div class="claimed-by-status">✓ Klart</div>`;
        } else if (msg.claimedBy) {
          const claimedByUser = allUsers[msg.claimedBy] || { name: 'Någon' };
          if (msg.claimedBy === currentUserId) {
            claimedByHTML = `<button class="complete-task-btn" data-index="${index}"><svg width="16" height="16" viewBox="0 0 256 256"><use href="icons.svg#ph-check-circle"></use></svg>Markera som klar</button>`;
          } else {
            claimedByHTML = `<div class="claimed-by-status">✓ Tagen av ${claimedByUser.name}</div>`;
          }
        }
      }
      const reactionsHTML = renderReactions(msg, index);
      const footerContent = claimedByHTML + reactionsHTML;
      const footerHTML = footerContent ? `<div class="message-footer">${footerContent}</div>` : '';

      messageHTML = `
        <div class="${containerClasses} ${containerExtraClass}">
          ${avatarHTML}
          <div class="text-block" style="background-color: ${USER_COLORS[user.colorClass] || '#f0f0f0'};">
            <div class="message-header">
              <span class="sender-name">${user.name}</span> ${timestampHTML}
            </div>
            <p class="message-text">${msg.text}</p>${footerHTML}
          </div>
        </div>
      `;
    }

    chatFeed.insertAdjacentHTML('beforeend', messageHTML);
  });

  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function sendMessage() {
  const text = inputField.value.trim();

  const messages = allMessages[currentChannelId] || []; // Hämta rätt meddelandelista (eller skapa om den saknas)
  if (text === '') return; 

  // Vi använder claimedBy: null för att indikera att en uppgift inte är tagen
  messages.push({ 
    text: text, 
    type: currentMessageType, // Använd den valda typen
    claimedBy: null,
    completed: false,
    userId: currentUserId,
    timestamp: new Date(),
    reactions: {} // NYTT: Initiera med ett tomt reaktionsobjekt
  });

  allMessages[currentChannelId] = messages; // Säkerställ att listan sparas om den var ny
  localStorage.setItem('allChannels', JSON.stringify(allChannels));
  localStorage.setItem('chatMessages', JSON.stringify(allMessages)); // Spara hela objektet
  renderMessages();

  // NYTT: Animera det nya meddelandet
  const lastMessage = chatFeed.querySelector('.message-container:last-child');
  if (lastMessage) {
    lastMessage.classList.add('new-message-anim');
  }

  // NYTT: Dölj "skriver"-indikatorn när meddelandet skickas
  clearTimeout(typingTimeout);
  hideTypingIndicator();
  inputField.value = '';
  updateLastSeen(); // Uppdatera status när meddelande skickas
  sendBtn.classList.add('hidden');
}

function toggleReaction(msgIndex, emoji) {
  const messages = allMessages[currentChannelId]; // Hämta rätt meddelandelista
  const msg = messages[msgIndex];

  if (!msg.reactions[emoji]) {
    msg.reactions[emoji] = []; // Skapa arrayen om emojin inte finns
  }

  const reactedUsers = msg.reactions[emoji];
  const userIndex = reactedUsers.indexOf(currentUserId);

  if (userIndex > -1) {
    reactedUsers.splice(userIndex, 1); // Ta bort användaren om hen redan reagerat
    if (reactedUsers.length === 0) delete msg.reactions[emoji]; // Ta bort emojin om ingen reagerar längre
  } else {
    reactedUsers.push(currentUserId); // Lägg till användaren om hen inte reagerat
  }
  localStorage.setItem('allChannels', JSON.stringify(allChannels));
  localStorage.setItem('chatMessages', JSON.stringify(allMessages)); // Spara hela objektet
  renderMessages();
  updateLastSeen(); // Uppdatera status vid reaktion
}

chatFeed.addEventListener('click', function(event) {
  // --- Hantering för "Jag tar denna"-knappen ---
  // Kolla om det användaren klickade på var just en "Jag tar denna!"-knapp
  if (event.target.classList.contains('task-btn')) {
    
    // Leta upp hela uppgiftsrutan och ta reda på dess index-nummer
    const taskBox = event.target.closest('.task-message');
    const index = taskBox.getAttribute('data-index');
    
    // Starta CSS-animationen genom att lägga till klassen vi skapade
    taskBox.classList.add('claimed-anim');
    
    // Vänta 400 millisekunder (så animationen hinner spelas upp klart)
    // Innan vi uppdaterar databasen och ritar om skärmen
    setTimeout(() => {
      const messages = allMessages[currentChannelId];
      messages[index].claimedBy = currentUserId;
      messages.push({
        type: 'system',
        actorId: currentUserId,
        text: `har tagit sig an uppgiften: "${messages[index].text}"`,
        timestamp: new Date()
      });
      localStorage.setItem('allChannels', JSON.stringify(allChannels));
      localStorage.setItem('chatMessages', JSON.stringify(allMessages));
      renderMessages();
      renderProfileView(currentUserId);
    }, 400);
  }

  if (event.target.classList.contains('complete-task-btn')) {
    const index = event.target.getAttribute('data-index');
    const messages = allMessages[currentChannelId];
    messages[index].completed = true;
    messages.push({
      type: 'system',
      actorId: currentUserId,
      text: `har slutfört uppgiften: "${messages[index].text}"`,
      timestamp: new Date()
    });
    localStorage.setItem('chatMessages', JSON.stringify(allMessages));
    renderMessages();
  }

  // NYTT: Hantera klick på avatar
  const avatarWrapper = event.target.closest('.avatar-wrapper');
  if (avatarWrapper) {
    const userId = avatarWrapper.getAttribute('data-user-id');
    switchView('profile-view', userId);
    return; // Avsluta för att inte trigga andra klickhanterare
  }

  // --- NYTT: Hantering för reaktionsknappar ---
  const reactionButton = event.target.closest('.reaction-btn');
  if (reactionButton) {
    // Om det är "Lägg till"-knappen, öppna menyn
    if (reactionButton.classList.contains('add-reaction-btn')) {
      openEmojiPicker(reactionButton);
      event.stopPropagation(); // Förhindra att klicket stänger menyn direkt
    }
    // Om det är en befintlig reaktion, toggla den
    else if (reactionButton.classList.contains('existing-reaction')) {
      const emoji = reactionButton.getAttribute('data-emoji');
      const msgIndex = parseInt(reactionButton.getAttribute('data-msg-index'), 10);
      const msg = allMessages[currentChannelId][msgIndex];
      // Om användaren redan har reagerat med denna emoji, ta bort reaktionen. Annars, öppna menyn.
      if (msg.reactions[emoji]?.includes(currentUserId)) {
        toggleReaction(msgIndex, emoji);
      } else {
        openEmojiPicker(reactionButton);
        event.stopPropagation();
      }
    }
  }
});

// NYTT: Hantera klick på dropdown-knappen för meddelandetyp
typeSelectorBtn.addEventListener('click', (event) => {
  event.stopPropagation(); // Förhindra att dokument-klicket stänger menyn direkt
  typeSelectorDropdown.classList.toggle('hidden');
});

// NYTT: Fyll dropdown-menyn med alternativ
function renderTypeSelectorDropdown() {
  typeSelectorDropdown.innerHTML = '';
  for (const type in MESSAGE_TYPES) {
    const option = MESSAGE_TYPES[type];
    const button = document.createElement('button');
    button.className = 'type-selector-option'; // NYTT: Använd den nya klassen
    button.dataset.value = type;
    // NYTT: Lägg till både ikon och text
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#${option.icon}"></use></svg><span>${option.label}</span>`;

    button.addEventListener('click', () => {
      // Uppdatera huvudknappen
      typeSelectorBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 256 256"><use href="icons.svg#${option.icon}"></use></svg>`;
      typeSelectorBtn.title = option.label;
      currentMessageType = type;
      
      // Stäng dropdown
      typeSelectorDropdown.classList.add('hidden');
    });

    typeSelectorDropdown.appendChild(button);
  }
}

// Stäng dropdown-menyn om man klickar någon annanstans
document.addEventListener('click', () => {
  typeSelectorDropdown.classList.add('hidden');
});

// NYTT: Funktioner för att visa/dölja "skriver"-indikatorn
function showTypingIndicator(userName) {
  typingUserName.textContent = `${userName} skriver`;
  typingIndicator.classList.remove('hidden');
  chatFeed.scrollTop = chatFeed.scrollHeight; // Scrolla ner så man ser den
}

function hideTypingIndicator() {
  typingIndicator.classList.add('hidden');
}

// NYTT: Simulera att Kollegabot skriver ibland
function simulateBotTyping() {
  // 20% chans att botten "svarar"
  if (Math.random() < 0.2) {
    setTimeout(() => {
      showTypingIndicator('Kollegabot');
      setTimeout(() => {
        hideTypingIndicator();
        // Här skulle man kunna lägga till ett faktiskt svar från botten i framtiden
      }, 2000 + Math.random() * 3000); // Låtsas skriva i 2-5 sekunder
    }, 1000); // Vänta 1 sekund innan botten börjar skriva
  }
}

// Behåller lyssnarna för textfältet och skickaknappen
inputField.addEventListener('input', function() {
  if (inputField.value.trim().length > 0) {
    sendBtn.classList.remove('hidden');
  } else {
    sendBtn.classList.add('hidden');
  }
});

sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') sendMessage();
});
sendBtn.addEventListener('click', simulateBotTyping); // Bonus: Låt botten "svara"

// Stäng emoji-menyn om man klickar någon annanstans
document.addEventListener('click', function(event) {
  if (!event.target.closest('.emoji-picker') && !event.target.closest('.add-reaction-btn') && !event.target.closest('#channel-menu-btn')) {
    closeAllMenus();
  }
});

// NYTT: Lyssna efter klick i navigeringsfältet
document.querySelector('.nav-bar').addEventListener('click', function(event) {
  const navItem = event.target.closest('.nav-item');
  if (navItem) {
    const viewId = navItem.getAttribute('data-view');

    // Återställd logik för att säkerställa att rätt vy visas
    if (viewId === 'profile-view') {
      switchView('profile-view', currentUserId);
    } else {
      switchView(viewId);
    }

    // Markera rätt knapp som aktiv
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');
  }
});

// NYTT: Funktion för att spara status (anropas från flera ställen)
function saveStatus() {
  const statusInput = document.getElementById('status-message-input');
  if (!statusInput) return;
  const newStatus = statusInput.value.trim();
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.statusMessage = newStatus;
  localStorage.setItem('currentUser', JSON.stringify(user));
  renderProfileView(); // Rita om för att visa ändringen
}

// NYTT: Lyssna efter klick på "Logga ut"-knappen på profilsidan
document.getElementById('profile-view').addEventListener('click', function(event) {
  if (event.target.id === 'logout-btn') {
    // Rensa användardata från minnet
    localStorage.removeItem('currentUser');
    localStorage.removeItem('chatMessages'); // Bra att även rensa chatten
    // Skicka tillbaka till inloggningssidan
    window.location.href = 'login.html';
  }

  // NYTT: Hantera radering av statusmeddelande
  if (event.target.closest('#clear-status-btn')) { // FIX: Använd .closest() för att fånga klick även på ikonen
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.statusMessage = '';
    localStorage.setItem('currentUser', JSON.stringify(user));
    renderProfileView();
  }

  // NYTT: Hantera klick på spara-knappen för status
  if (event.target.closest('#status-send-btn')) {
    saveStatus();
  }

  // NYTT: Hantera klick på "Skicka meddelande"-knappen
  const dmBtn = event.target.closest('#send-dm-btn');
  if (dmBtn) {
    startDirectMessage(dmBtn.dataset.userId);
  }
});

// NYTT: Lyssna på input i profilvyn för att visa/dölja spara-knappen
document.getElementById('profile-view').addEventListener('input', function(event) {
  if (event.target.id === 'status-message-input') {
    const statusSendBtn = document.getElementById('status-send-btn');
    if (event.target.value.trim().length > 0) {
      statusSendBtn.classList.remove('hidden');
    } else {
      statusSendBtn.classList.add('hidden');
    }
  }
});

// NYTT: Lyssna efter ändring av "Stör ej"-reglaget
document.getElementById('profile-view').addEventListener('change', function(event) {
  if (event.target.id === 'dnd-toggle') {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.doNotDisturb = event.target.checked;
    localStorage.setItem('currentUser', JSON.stringify(user));
    renderProfileView(); // Uppdatera statuspricken och texten direkt
  }
});

// NYTT: Lyssna efter Enter-tryck i profilvyn för att spara status
document.getElementById('profile-view').addEventListener('keypress', function(event) {
  if (event.target.id === 'status-message-input' && event.key === 'Enter') {
    event.preventDefault(); // Förhindra radbrytning eller formulär-submit
    saveStatus();
  }
});

// NYTT: Lyssna efter klick i hemvyn för att byta kanal
document.getElementById('home-view').addEventListener('click', function(event) {
  const channelButton = event.target.closest('.channel-list-item');
  if (channelButton) {
    const channelId = channelButton.getAttribute('data-channel-id');
    if (channelId !== currentChannelId) {
      currentChannelId = channelId;
      localStorage.setItem('currentChannelId', currentChannelId); // Spara valet
      renderMessages(); // Rendera om chatten med nya kanalens meddelanden
      renderHomeView(); // Rendera om hemvyn för att uppdatera aktiv kanal
    }
    // Växla automatiskt tillbaka till chattvyn och markera rätt flik
    switchView('chat-view');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.nav-item[data-view="chat-view"]').classList.add('active');
  }

  // NYTT: Hantera klick på "Gå med"-knapp
  const joinButton = event.target.closest('.join-channel-btn');
  if (joinButton) {
    const channelId = joinButton.getAttribute('data-channel-id');
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user.channels) user.channels = [];
    user.channels.push(channelId);
    localStorage.setItem('currentUser', JSON.stringify(user));

    // FIX: Lägg även till användaren i kanalens egen medlemslista,
    // annars saknas man i medlemsantal/medlemslista trots att man gått med.
    if (!allChannels[channelId].members) allChannels[channelId].members = [];
    if (!allChannels[channelId].members.includes(user.id)) {
      allChannels[channelId].members.push(user.id);
    }
    localStorage.setItem('allChannels', JSON.stringify(allChannels));

    renderHomeView(); // Rita om hemvyn för att flytta kanalen
  }

  // NYTT: Hantera klick på "Skapa kanal"-knapp
  if (event.target.id === 'create-channel-btn') {
    let channelName = prompt('Ange namn på den nya kanalen (t.ex. #pausrummet):');
    if (channelName && channelName.trim() !== '') {
      channelName = channelName.trim();
      const isPrivate = confirm('Ska kanalen vara privat? \n(Syns inte för andra och kräver inbjudan)');

      const newChannelId = 'ch' + Date.now();
      const formattedName = channelName.startsWith('#') ? channelName : `# ${channelName}`;

      // Lägg till i globala kanallistan
      allChannels[newChannelId] = { name: formattedName, isPublic: !isPrivate, isDM: false };
      localStorage.setItem('allChannels', JSON.stringify(allChannels));

      // Skapa en tom meddelandelista för kanalen
      allMessages[newChannelId] = [];
      localStorage.setItem('chatMessages', JSON.stringify(allMessages));

      // Lägg till kanalen i användarens lista
      const user = JSON.parse(localStorage.getItem('currentUser'));
      const allUsersFromStorage = JSON.parse(localStorage.getItem('allUsers')); // Hämta alla användare
      if (!user.channels) user.channels = [];
      user.channels.push(newChannelId);
      localStorage.setItem('currentUser', JSON.stringify(user));
      allUsersFromStorage[user.id] = user; // Uppdatera användaren i den globala listan
      localStorage.setItem('allUsers', JSON.stringify(allUsersFromStorage));

      // Uppdatera och byt vy
      if (!allChannels[newChannelId].members) {
        allChannels[newChannelId].members = [];
      }
      allChannels[newChannelId].members.push(user.id);
      // FIX: Spara kanallistan IGEN efter att medlemmen lagts till
      localStorage.setItem('allChannels', JSON.stringify(allChannels)); // FIX: Spara kanallistan IGEN efter att medlemmen lagts till
      currentChannelId = newChannelId;
      localStorage.setItem('currentChannelId', currentChannelId);
      
      renderHomeView();
      switchView('chat-view');
    }
  }
});

// NYTT: Funktion för att starta ett direktmeddelande
function startDirectMessage(otherUserId) {
  const user = JSON.parse(localStorage.getItem('currentUser'));

  // Skapa ett förutsägbart kanal-ID
  const dmChannelId = [user.id, otherUserId].sort().join('_dm_');

  // Kolla om kanalen redan finns
  if (!allChannels[dmChannelId]) {
    // Skapa en ny DM-kanal om den inte finns
    allChannels[dmChannelId] = {
      name: `DM med ${allUsers[otherUserId].name}`,
      isPublic: false,
      isDM: true,
      members: [user.id, otherUserId]
    };

    // Skapa en tom meddelandelista
    if (!allMessages[dmChannelId]) {
      allMessages[dmChannelId] = [];
    }

    // Lägg till kanalen i båda användarnas kanallistor
    if (!user.channels.includes(dmChannelId)) {
      user.channels.push(dmChannelId);
    }
    // Vi behöver uppdatera den andra användaren också, vilket kräver att vi sparar alla användare
    const otherUser = allUsers[otherUserId];
    if (!otherUser.channels) otherUser.channels = [];
    if (!otherUser.channels.includes(dmChannelId)) {
      otherUser.channels.push(dmChannelId);
    }

    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
    localStorage.setItem('allChannels', JSON.stringify(allChannels));
    localStorage.setItem('chatMessages', JSON.stringify(allMessages));
  }

  // Byt till den nya DM-kanalen och visa chattvyn
  switchView('chat-view', { channelId: dmChannelId });
}

// --- NYTT: Funktioner för kanalmenyn ---
function toggleChannelMenu(button) {
  const existingMenu = document.getElementById('channel-menu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'channel-menu';
  menu.className = 'channel-menu';

  let menuItems = '';
  // Alternativ 1: Bjud in (endast för privata kanaler)
  if (!allChannels[currentChannelId]?.isPublic) {
    menuItems += `<button class="channel-menu-item" id="menu-invite-btn">Bjud in till kanal</button>`;
  }
  // Alternativ 2: Lämna kanal
  menuItems += `<button class="channel-menu-item" id="menu-leave-btn">Lämna kanal</button>`;

  menu.innerHTML = menuItems;
  document.body.appendChild(menu);

  // Positionera menyn
  const btnRect = button.getBoundingClientRect();
  menu.style.top = `${btnRect.bottom + window.scrollY + 5}px`;
  menu.style.right = `${window.innerWidth - btnRect.right - window.scrollX}px`;

  // Lägg till händelselyssnare
  document.getElementById('menu-invite-btn')?.addEventListener('click', () => {
    openInviteModal();
    closeAllMenus();
  });
  document.getElementById('menu-leave-btn')?.addEventListener('click', () => {
    leaveCurrentChannel();
    closeAllMenus();
  });
}

// --- NYTT: Funktioner för att hantera inbjudningsmodalen ---
function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  const userList = document.getElementById('invite-user-list');
  userList.innerHTML = ''; // Rensa listan

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel) return;

  // Hitta användare som INTE redan är medlemmar
  const usersToInvite = Object.keys(allUsers).filter(userId =>
    !currentChannel.members.includes(userId) && userId !== 'user2' // Visa inte boten
  );

  if (usersToInvite.length === 0) {
    userList.innerHTML = '<p class="no-tasks-message">Alla användare är redan med i kanalen.</p>';
  } else {
    usersToInvite.forEach(userId => {
      const user = allUsers[userId];
      const userItem = document.createElement('div');
      userItem.className = 'invite-user-item';
      userItem.innerHTML = `
        <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
        <span class="invite-user-name">${user.name}</span>
        <button class="invite-btn" data-user-id="${userId}">Bjud in</button>
      `;
      userList.appendChild(userItem);
    });
  }

  modal.classList.remove('hidden');
}

function closeInviteModal() {
  document.getElementById('invite-modal').classList.add('hidden');
}

function inviteUserToChannel(userId) {
  allChannels[currentChannelId].members.push(userId);
  localStorage.setItem('allChannels', JSON.stringify(allChannels));

  // FIX: Lägg även till kanalen i den inbjudna användarens egen kanallista,
  // annars syns kanalen aldrig för dem (särskilt allvarligt för privata
  // kanaler, som inte dyker upp i "Bläddra bland kanaler" att gå med i).
  const invitedUser = allUsers[userId];
  if (invitedUser) {
    if (!invitedUser.channels) invitedUser.channels = [];
    if (!invitedUser.channels.includes(currentChannelId)) {
      invitedUser.channels.push(currentChannelId);
    }
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  }

  // Uppdatera vyerna för att visa ändringen
  renderMessages(); // Uppdaterar medlemsantalet i headern
  closeInviteModal();
}

// --- NYTT: Funktion för att lämna en kanal ---
function leaveCurrentChannel() {
  const channelName = allChannels[currentChannelId]?.name || 'denna kanal';
  if (confirm(`Är du säker på att du vill lämna ${channelName}?`)) {
    // Ta bort från användarens kanallista
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.channels = user.channels.filter(chId => chId !== currentChannelId);
    localStorage.setItem('currentUser', JSON.stringify(user));

    // Ta bort från kanalens medlemslista
    const channel = allChannels[currentChannelId];
    if (channel && channel.members) {
      channel.members = channel.members.filter(memberId => memberId !== currentUserId);
      localStorage.setItem('allChannels', JSON.stringify(allChannels));
    }

    // Återställ currentChannelId och byt vy
    currentChannelId = null;
    localStorage.removeItem('currentChannelId');
    switchView('home-view');
  }
}

// --- NYTT: Funktioner för att hantera medlemslistan ---
function openMemberListModal() {
  const modal = document.getElementById('member-list-modal');
  const memberListBody = document.getElementById('member-list-body');
  memberListBody.innerHTML = ''; // Rensa listan

  const currentChannel = allChannels[currentChannelId];
  if (!currentChannel || !currentChannel.members) return;

  currentChannel.members.forEach(userId => {
    const user = allUsers[userId];
    if (user) {
      const userItem = document.createElement('div');
      userItem.className = 'member-list-item';
      userItem.innerHTML = `
        <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
        <span class="member-list-name">${user.name}</span>
      `;
      memberListBody.appendChild(userItem);
    }
  });

  modal.classList.remove('hidden');
}

function closeMemberListModal() {
  document.getElementById('member-list-modal').classList.add('hidden');
}

document.querySelector('.header-channel-info').addEventListener('click', () => {
  if (document.getElementById('chat-view').classList.contains('active-view')) {
    openMemberListModal();
  }
});

function switchView(viewId, data) {
  const views = document.querySelectorAll('.view');
  views.forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active-view');
  });
  const activeView = document.getElementById(viewId);
  activeView?.classList.remove('hidden');
  activeView?.classList.add('active-view');
  updateLastSeen(); // Uppdatera status vid navigering

  // NYTT: Om vi byter till chattvyn, se till att vi har rätt kanal-ID
  if (viewId === 'chat-view' && data && data.channelId) {
    currentChannelId = data.channelId;
    localStorage.setItem('currentChannelId', currentChannelId);
  }
  
  // Återställd och förenklad logik för att hantera headern
  const headerLeftContent = document.getElementById('header-left-content');
  const headerTitle = document.querySelector('.header-title');
  const headerRightContent = document.getElementById('header-right-content');
  const headerMemberCount = document.querySelector('.header-member-count');

  // Återställ höger sida av headern
  headerRightContent.innerHTML = '';

  if (viewId === 'chat-view') {
    // Markera rätt nav-knapp som aktiv
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.nav-item[data-view="chat-view"]').classList.add('active');
    renderMessages();
    document.querySelector('.header-channel-info').style.cursor = 'pointer';
    headerTitle.textContent = allChannels[currentChannelId]?.name || 'Kanal';
    headerMemberCount.style.display = 'block';
    // NYTT: Visa inbjudningsknapp för privata kanaler
    if (currentChannelId) { // Visa bara menyn om vi är i en kanal
      headerRightContent.innerHTML = `<button id="channel-menu-btn" class="header-action-btn" title="Kanalalternativ"><svg width="22" height="22" viewBox="0 0 256 256"><use href="icons.svg#ph-dots-three-outline-vertical"></use></svg></button>`;
      headerRightContent.querySelector('#channel-menu-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleChannelMenu(e.currentTarget); });
    }
    headerLeftContent.innerHTML = `<button id="back-to-home-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    document.getElementById('back-to-home-btn').addEventListener('click', () => switchView('home-view'));
  } else if (viewId === 'profile-view') {
    renderProfileView(data); // `data` är userId här
    document.querySelector('.header-channel-info').style.cursor = 'default';
    headerTitle.textContent = 'Profil';
    headerMemberCount.style.display = 'none';
    headerLeftContent.innerHTML = `<button id="back-to-chat-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    document.getElementById('back-to-chat-btn').addEventListener('click', () => switchView('chat-view'));
  } else if (viewId === 'home-view') {
    renderHomeView();
    document.querySelector('.header-channel-info').style.cursor = 'default';
    headerTitle.textContent = 'Kanaler';
    headerMemberCount.style.display = 'none';
    // Återställ till avatar
    const user = allUsers[currentUserId];
    headerLeftContent.innerHTML = `<div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>`;
    headerLeftContent.replaceWith(headerLeftContent.cloneNode(true)); // Rensa gamla event listeners
  }
}

// --- NYTT: Event listeners för inbjudningsmodalen ---
document.getElementById('close-modal-btn').addEventListener('click', closeInviteModal);
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
document.getElementById('close-member-list-btn').addEventListener('click', closeMemberListModal);
document.getElementById('member-list-modal').addEventListener('click', (event) => {
  // Stäng modalen om man klickar på bakgrunden
  if (event.target.id === 'member-list-modal') {
    closeMemberListModal();
  }
});

// Initiera appen
renderTypeSelectorDropdown();
switchView('home-view'); // Starta på hemvyn
updateLastSeen();

// Uppdatera status med jämna mellanrum för att texten ("Sågs för X min sedan") ska vara aktuell
setInterval(() => {
  // Uppdatera bara profilen om den visas, för att spara resurser
  if (document.getElementById('profile-view').classList.contains('active-view')) {
    renderProfileView(currentUserId);
  }
}, 60 * 1000); // Varje minut