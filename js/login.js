document.getElementById('login-form').addEventListener('submit', function(event) {
  event.preventDefault(); // Förhindra att sidan laddas om

  const username = document.getElementById('username').value.trim();
  let avatarChar = '';

  if (!username) return;

  // Hämta alla användare från minnet
  let allUsers = JSON.parse(localStorage.getItem('allUsers')) || {};
  
  // Leta efter en befintlig användare med samma namn (ignorerar skiftläge)
  const existingUserEntry = Object.entries(allUsers).find(([id, u]) => u.name.toLowerCase() === username.toLowerCase());
  let user;

  if (existingUserEntry) {
    // Användare hittades! Logga in som den befintliga användaren.
    const [userId, userData] = existingUserEntry;
    user = { id: userId, ...userData };
  } else {
    // Ingen användare hittades. Skapa en ny.
    const nameParts = username.split(' ').filter(part => part.length > 0);
    if (nameParts.length >= 2) {
      avatarChar = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    } else if (nameParts.length === 1) {
      avatarChar = nameParts[0][0].toUpperCase();
    }

    user = {
      id: 'user' + Date.now(), // Skapa ett unikt ID för användaren
      name: username,
      avatarChar: avatarChar,
      colorClass: ['cyan', 'magenta', 'green', 'orange'][Math.floor(Math.random() * 4)], // Ge en slumpmässig färg
      channels: [], // Nya användare startar utan kanaler
      mutedChannels: [] // Och utan tystade kanaler
    };
    
    // Lägg till den nya användaren i den globala listan
    allUsers[user.id] = { name: user.name, avatarChar: user.avatarChar, colorClass: user.colorClass, channels: user.channels, mutedChannels: user.mutedChannels };
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  }

  // Spara den (antingen nya eller befintliga) användaren som inloggad
  localStorage.setItem('currentUser', JSON.stringify(user));
  window.location.href = 'index.html'; // Skicka användaren till chatten
});