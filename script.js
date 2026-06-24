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

// Steg 3: Bygg upp användarlistan dynamiskt
const users = {
  [currentUser.id]: { name: currentUser.name, avatarChar: currentUser.avatarChar, colorClass: 'cyan', lightColor: '#e7f3fa', status: 'active' },
  'user2': { name: 'Kollegabot', avatarChar: 'K', colorClass: 'magenta', lightColor: '#fce8ef', status: 'inactive' }
};
const currentUserId = currentUser.id; // Sätt den inloggade användarens ID

// NYTT: Definiera våra meddelandetyper med ikoner
const MESSAGE_TYPES = {
  'message': { label: 'Meddelande', icon: 'ph-chat' },
  'task': { label: 'Uppgift', icon: 'ph-check-square' }
};

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔'];

// NYTT: Definiera kanaler och meddelandestruktur
const channels = {
  'ch1': { name: '# planering-fritids', isPublic: true },
  'ch2': { name: '# hela-arbetslaget', isPublic: true }
};

// Hämta den senast valda kanalen, eller välj den första som standard
let currentChannelId = localStorage.getItem('currentChannelId') || Object.keys(channels)[0];


// Läs in ALLA meddelanden från minnet
let allMessages = JSON.parse(localStorage.getItem('chatMessages')) || { 'ch1': [], 'ch2': [] };
// Säkerställ att meddelandearray finns för varje kanal

// Läs in ALLA kanaler från minnet, eller använd standard
let allChannels = JSON.parse(localStorage.getItem('allChannels')) || channels;
Object.keys(allChannels).forEach(chId => { if (!allMessages[chId]) allMessages[chId] = []; });

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
  const userToView = isOwnProfile ? JSON.parse(localStorage.getItem('currentUser')) : users[userId];

  if (!userToView) return; // Avbryt om användaren inte finns

  const status = calculateStatus(userToView.lastSeen);

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
      <!-- NYTT: Inställningssektion för "Stör ej" -->
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
            <input type="checkbox" id="dnd-toggle">
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
  const loggedInUser = JSON.parse(localStorage.getItem('currentUser')); // FIX: Hämta användaren från minnet
  let finalHTML = '';

  // Del 1: Rendera kanaler
  const userChannels = loggedInUser?.channels || [];
  let myChannelsHTML = '<div class="channel-list"><h3>Dina kanaler</h3>';
  userChannels.forEach(channelId => {
    const channel = allChannels[channelId];
    if (channel) {
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
  myChannelsHTML += '</div>';
  finalHTML += myChannelsHTML;

  // Del 1.5: Bläddra bland kanaler
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
        const claimedBy = users[task.claimedBy]?.name || 'Någon';
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
  const memberCount = Object.keys(users).length;
  const memberText = memberCount === 1 ? '1 medlem' : `${memberCount} medlemmar`;
  document.querySelector('.header-member-count').textContent = memberText;

  const messages = allMessages[currentChannelId]; // Hämta meddelanden för aktuell kanal
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

    const user = users[msg.userId] || users[currentUserId]; // Hämta användarinfo
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
      const actorName = msg.actorId === currentUserId ? 'Du' : (users[msg.actorId]?.name || 'Någon');
      let fullText = `${actorName} ${msg.text}`;
      if (msg.actorId === currentUserId) fullText = fullText.replace(' sig an', ' dig an');
      messageHTML = `<div class="message-container system-message"><p class="message-text">${fullText}</p></div>`;
    }
    else if (msg.type === 'task' && !msg.claimedBy) {
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
      let containerExtraClass = '';
      if (msg.type === 'task') {
        if (msg.completed) {
          containerExtraClass = 'completed-task';
          claimedByHTML = `<div class="claimed-by-status">✓ Klart</div>`;
        } else if (msg.claimedBy) {
          const claimedByUser = users[msg.claimedBy] || { name: 'Någon' };
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

  const messages = allMessages[currentChannelId]; // Hämta rätt meddelandelista
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
    // NYTT: Visa att användaren skriver och sätt en timer för att dölja det
    showTypingIndicator('Du');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(hideTypingIndicator, 3000); // Dölj efter 3 sek inaktivitet
  } else {
    sendBtn.classList.add('hidden');
    hideTypingIndicator();
  }
});

sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') sendMessage();
});
sendBtn.addEventListener('click', simulateBotTyping); // Bonus: Låt botten "svara"

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
      allChannels[newChannelId] = { name: formattedName, isPublic: !isPrivate };
      localStorage.setItem('allChannels', JSON.stringify(allChannels));

      // Skapa en tom meddelandelista för kanalen
      allMessages[newChannelId] = [];
      localStorage.setItem('chatMessages', JSON.stringify(allMessages));

      // Lägg till kanalen i användarens lista
      const user = JSON.parse(localStorage.getItem('currentUser'));
      if (!user.channels) user.channels = [];
      user.channels.push(newChannelId);
      localStorage.setItem('currentUser', JSON.stringify(user));

      // Uppdatera och byt vy
      currentChannelId = newChannelId;
      localStorage.setItem('currentChannelId', currentChannelId);
      renderHomeView();
      switchView('chat-view');
    }
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
  
  // Återställd och förenklad logik för att hantera headern
  const headerLeftContent = document.getElementById('header-left-content');
  const headerTitle = document.querySelector('.header-title');
  const headerMemberCount = document.querySelector('.header-member-count');

  if (viewId === 'chat-view') {
    renderMessages();
    headerTitle.textContent = allChannels[currentChannelId]?.name || 'Kanal';
    headerMemberCount.style.display = 'block';
    headerLeftContent.innerHTML = `<button id="back-to-home-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    document.getElementById('back-to-home-btn').addEventListener('click', () => switchView('home-view'));
  } else if (viewId === 'profile-view') {
    renderProfileView(data); // `data` är userId här
    headerTitle.textContent = 'Profil';
    headerMemberCount.style.display = 'none';
    headerLeftContent.innerHTML = `<button id="back-to-chat-btn" class="header-back-btn"><svg width="24" height="24" viewBox="0 0 256 256"><use href="icons.svg#ph-arrow-left"></use></svg></button>`;
    document.getElementById('back-to-chat-btn').addEventListener('click', () => switchView('chat-view'));
  } else if (viewId === 'home-view') {
    renderHomeView();
    headerTitle.textContent = 'Kanaler';
    headerMemberCount.style.display = 'none';
    // Återställ till avatar
    const user = users[currentUserId];
    headerLeftContent.innerHTML = `<div class="avatar-placeholder ${user.colorClass}">${user.avatarChar}</div>`;
    headerLeftContent.replaceWith(headerLeftContent.cloneNode(true)); // Rensa gamla event listeners
  }
}

// Initiera appen
renderTypeSelectorDropdown();
renderMessages();
updateLastSeen();

// Uppdatera status med jämna mellanrum för att texten ("Sågs för X min sedan") ska vara aktuell
setInterval(() => {
  // Uppdatera bara profilen om den visas, för att spara resurser
  if (document.getElementById('profile-view').classList.contains('active-view')) {
    renderProfileView(currentUserId);
  }
}, 60 * 1000); // Varje minut