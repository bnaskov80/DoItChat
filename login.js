document.getElementById('login-form').addEventListener('submit', function(event) {
  event.preventDefault(); // Förhindra att sidan laddas om

  const username = document.getElementById('username').value.trim();
  const avatarChar = document.getElementById('avatar-char').value.trim().toUpperCase();

  if (username && avatarChar) {
    const user = {
      id: 'user' + Date.now(), // Skapa ett unikt ID för användaren
      name: username,
      avatarChar: avatarChar,
      colorClass: 'cyan' // Använder 'cyan' som standardfärg för nya användare
    };

    // Spara användarinformationen i webbläsarens minne
    localStorage.setItem('currentUser', JSON.stringify(user));
    window.location.href = 'index.html'; // Skicka användaren till chatten
  }
});