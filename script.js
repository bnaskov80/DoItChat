const sendBtn = document.querySelector('.send-btn');
const inputField = document.querySelector('.input-area input');
const chatFeed = document.querySelector('.chat-feed');
const typeSelector = document.getElementById('message-type');

// Steg 1: Hämta inloggad användare från minnet
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

// Steg 2: Om ingen användare är inloggad, skicka tillbaka till login.html
if (!currentUser) {
  window.location.href = 'login.html';
}

// Steg 3: Bygg upp användarlistan dynamiskt
const users = {
  [currentUser.id]: { name: currentUser.name, avatarChar: currentUser.avatarChar, colorClass: 'cyan', lightColor: '#e7f3fa' },
  'user2': { name: 'Kollegabot', avatarChar: 'K', colorClass: 'magenta', lightColor: '#fce8ef', status: 'inactive' }
};
const currentUserId = currentUser.id; // Sätt den inloggade användarens ID

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔'];

// NYTT: Definiera kanaler och meddelandestruktur
const channels = {
  'ch1': { name: '# planering-fritids' },
  'ch2': { name: '# hela-arbetslaget' }
};

// Hämta den senast valda kanalen, eller välj den första som standard
let currentChannelId = localStorage.getItem('currentChannelId') || Object.keys(channels)[0];

// Läs in ALLA meddelanden från minnet
let allMessages = JSON.parse(localStorage.getItem('chatMessages')) || { 'ch1': [], 'ch2': [] };
// Säkerställ att meddelandearray finns för varje kanal
Object.keys(channels).forEach(chId => { if (!allMessages[chId]) allMessages[chId] = []; });

function updateLastSeen() {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.lastSeen = new Date().toISOString();
  localStorage.setItem('currentUser', JSON.stringify(user));
}

function calculateStatus(lastSeen) {
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

  // Om det inte finns några reaktioner, visa bara "lägg till"-knappen.
  let reactionsHTML = `
    <div class="reactions-container">
      <button class="reaction-btn add-reaction-btn" data-msg-index="${msgIndex}" title="Lägg till reaktion">⊕</button>
  `;

  // Om det finns reaktioner, rendera dem.
  if (reactionKeys.length > 0) {
    reactionsHTML = `<div class="reactions-container has-reactions">`; // Lägg till klass för styling
    reactionKeys.forEach(emoji => {
      const count = reactions[emoji].length;
      const userHasReacted = reactions[emoji].includes(currentUserId);
      reactionsHTML += `<button class="reaction-btn existing-reaction" data-msg-index="${msgIndex}" data-emoji="${emoji}">${emoji} ${count}</button>`;
    });
  }
  return reactionsHTML + '</div>';
}

function renderProfileView() {
  const profileView = document.getElementById('profile-view');
  const loggedInUser = JSON.parse(localStorage.getItem('currentUser'));
  const status = calculateStatus(loggedInUser.lastSeen);

  profileView.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar-wrapper">
        <div class="avatar-placeholder ${loggedInUser.colorClass}">${loggedInUser.avatarChar}</div>
        <div class="status-indicator ${status.key}"></div>
      </div>
      <div class="profile-info">
        <span class="profile-name">${loggedInUser.name}</span>
        <span class="profile-status">${status.text}</span>
      </div>
    </div>
    <!-- NYTT: Behållare för statusmeddelande -->
    <div class="status-message-container">
      ${loggedInUser.statusMessage ? `
        <div class="status-message-display">
          <span>${loggedInUser.statusMessage}</span>
          <button id="clear-status-btn">✕</button>
        </div>
      ` : `
        <div class="input-pill">
          <input type="text" id="status-message-input" placeholder="Ange en status...">
          <button class="send-btn hidden" id="status-send-btn" aria-label="Spara status">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </button>
        </div>
      `}
    </div>
    <!-- NYTT: Inställningssektion för "Stör ej" -->
    <div class="settings-section">
      <div class="settings-item">
        <div class="settings-item-main">
          <span class="settings-icon">🌙</span>
          <div class="settings-item-text">
            <span class="settings-item-title">Stör ej</span>
            <span class="settings-item-description">Visa dig själv som inaktiv</span>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="dnd-toggle">
          <span class="slider"></span>
        </label>
      </div>
    </div>
    <div class="profile-actions">
      <button id="logout-btn" class="list-item-btn">Logga ut</button>
    </div>
  `;
}

function renderHomeView() {
  const homeView = document.getElementById('home-view');
  let finalHTML = '';

  // Del 1: Rendera kanaler
  let channelHTML = '<div class="channel-list">';
  channelHTML += '<h3>Kanaler</h3>';

  for (const channelId in channels) {
    const channel = channels[channelId];
    const isActive = channelId === currentChannelId ? 'active' : '';
    channelHTML += `
      <button class="channel-list-item ${isActive}" data-channel-id="${channelId}">
        ${channel.name}
      </button>
    `;
  }
  channelHTML += '</div>';
  finalHTML += channelHTML;

  // Del 2: Separator och uppgiftslista
  finalHTML += '<hr class="section-divider">';
  let taskHTML = '<div class="home-task-list">';
  taskHTML += '<h3>Uppgifter</h3>';

  // Samla alla uppgifter från alla kanaler
  const allTasks = Object.values(allMessages).flat().filter(msg => msg.type === 'task');

  if (allTasks.length > 0) {
    allTasks.forEach(task => {
      const claimedBy = task.claimedBy ? (users[task.claimedBy]?.name || 'Någon') : null;
      taskHTML += `
        <div class="home-task-item ${claimedBy ? 'claimed' : ''}">
          <p class="home-task-text">${task.text}</p>
          ${claimedBy ? `<span class="home-task-status">✓ Tagen av ${claimedBy}</span>` : ''}
        </div>
      `;
    });
  } else {
    taskHTML += '<p class="no-tasks-message">Inga uppgifter att visa.</p>';
  }
  taskHTML += '</div>';
  finalHTML += taskHTML;

  homeView.innerHTML = finalHTML;
}

function renderMessages() {
  chatFeed.innerHTML = '';

  // NYTT: Uppdatera headern med användarens avatar
  const headerAvatarContainer = document.querySelector('.header-avatar-container');
  const user = users[currentUserId];
  headerAvatarContainer.innerHTML = `
    <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
  `;
  // Behåll sidans titel (kan ändras senare när vi bygger ut tabbarna)
  document.querySelector('.header-title').textContent = channels[currentChannelId].name;

  // NYTT: Uppdatera medlemsantal
  const memberCount = Object.keys(users).length;
  const memberText = memberCount === 1 ? '1 medlem' : `${memberCount} medlemmar`;
  document.querySelector('.header-member-count').textContent = memberText;

  const messages = allMessages[currentChannelId]; // Hämta meddelanden för aktuell kanal
  messages.forEach(function(msg, index) {
    // Uppdaterar gamla meddelanden och lägger till en standardanvändare om det saknas
    // och lägger till en tidsstämpel om den saknas.
    if (typeof msg === 'string') {
      msg = { text: msg, type: 'message', claimed: false, userId: currentUserId, timestamp: new Date() };
    } else if (msg.claimed === true) { msg.claimedBy = currentUserId; msg.claimed = false; } // Migrera gamla data
    if (!msg.reactions) msg.reactions = {}; // Se till att alla meddelanden har ett reaktionsobjekt
    if (!msg.userId) msg.userId = currentUserId;
    if (!msg.timestamp) msg.timestamp = new Date(); // Fallback för gamla meddelanden

    const user = users[msg.userId] || users[currentUserId]; // Hämta användarinfo
    const isCurrentUser = msg.userId === currentUserId;
    const containerClasses = `message-container ${isCurrentUser ? 'is-current-user' : ''}`;
    const time = new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const timestampHTML = `<span class="message-timestamp">${time}</span>`;

    let messageHTML = '';
    
    // Vi bygger avataren.
    let avatarHTML = `
      <div class="avatar-wrapper">
        <div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>
      </div>
    `;

    // 1. Om det är en UPPGIFT som INTE ÄR TAGEN ännu
    if (msg.type === 'task' && !msg.claimedBy) {
      messageHTML = `
        <div class="${containerClasses} task-message" data-index="${index}">
          ${avatarHTML}
          <div class="text-block" style="background-color: ${user.lightColor};">
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
      if (msg.type === 'task' && msg.claimedBy) {
        const claimedByUser = users[msg.claimedBy] || { name: 'Någon' };
        claimedByHTML = `<div class="claimed-by-status">✓ Tagen av ${claimedByUser.name}</div>`;
      }
      const reactionsHTML = renderReactions(msg, index);
      const footerContent = claimedByHTML + reactionsHTML;
      const footerHTML = footerContent ? `<div class="message-footer">${footerContent}</div>` : '';

      messageHTML = `
        <div class="${containerClasses}">
          ${avatarHTML}
          <div class="text-block" style="background-color: ${user.lightColor};">
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
  const selectedType = typeSelector.value;

  const messages = allMessages[currentChannelId]; // Hämta rätt meddelandelista
  if (text === '') return; 

  // Vi använder claimedBy: null för att indikera att en uppgift inte är tagen
  messages.push({ 
    text: text, 
    type: selectedType,
    claimedBy: null,
    userId: currentUserId,
    timestamp: new Date(),
    reactions: {} // NYTT: Initiera med ett tomt reaktionsobjekt
  });

  localStorage.setItem('chatMessages', JSON.stringify(allMessages)); // Spara hela objektet
  renderMessages();
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
      messages[index].claimedBy = currentUserId; // Spara vem som tog uppgiften
      localStorage.setItem('chatMessages', JSON.stringify(allMessages));
      renderMessages(); // Rita ut allt på nytt (nu med grön prick istället för knapp)
      renderProfileView(); // NYTT: Se till att "Att göra"-listan i profilen också uppdateras
    }, 400);
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
      const msgIndex = reactionButton.getAttribute('data-msg-index');
      const emoji = reactionButton.getAttribute('data-emoji');
      toggleReaction(msgIndex, emoji);
    }
  }
});

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

// Stäng emoji-menyn om man klickar någon annanstans
document.addEventListener('click', function(event) {
  if (!event.target.closest('.emoji-picker') && !event.target.closest('.add-reaction-btn')) {
    closeAllEmojiPickers();
  }
});

// NYTT: Lyssna efter klick i navigeringsfältet
document.querySelector('.nav-bar').addEventListener('click', function(event) {
  const navItem = event.target.closest('.nav-item');
  if (navItem) {
    const viewId = navItem.getAttribute('data-view');
    switchView(viewId);
    // Uppdatera aktiv knapp
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');
  }
});

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
  if (event.target.id === 'clear-status-btn') {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.statusMessage = '';
    localStorage.setItem('currentUser', JSON.stringify(user));
    renderProfileView();
  }

  // NYTT: Hantera klick på spara-knappen för status
  if (event.target.closest('#status-send-btn')) {
    const statusInput = document.getElementById('status-message-input');
    const newStatus = statusInput.value.trim();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.statusMessage = newStatus;
    localStorage.setItem('currentUser', JSON.stringify(user));
    renderProfileView(); // Rita om för att visa ändringen
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
});

function switchView(viewId) {
  const views = document.querySelectorAll('.view');
  views.forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active-view');
  });
  const activeView = document.getElementById(viewId);
  activeView?.classList.remove('hidden');
  activeView?.classList.add('active-view');
  updateLastSeen(); // Uppdatera status vid navigering
}

renderMessages();
renderProfileView();
renderHomeView();
updateLastSeen(); // Sätt en initial status när sidan laddas

// Uppdatera status med jämna mellanrum för att texten ("Sågs för X min sedan") ska vara aktuell
setInterval(renderProfileView, 60 * 1000); // Varje minut