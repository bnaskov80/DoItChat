document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  const showRegisterBtn = document.getElementById('show-register-btn');
  const showLoginBtn = document.getElementById('show-login-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  let isRegistering = false;

  // Hämta en referens till din Firestore-databas
  const db = firebase.firestore();

  showRegisterBtn.addEventListener('click', () => {
    loginView.classList.add('hidden');
    registerView.classList.remove('hidden');
  });

  showLoginBtn.addEventListener('click', () => {
    registerView.classList.add('hidden');
    loginView.classList.remove('hidden');
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Inloggningen lyckades, omdirigera till chatten
        window.location.href = 'index.html';
      })
      .catch((error) => {
        // Hantera fel, t.ex. fel lösenord eller om användaren inte finns
        console.error("Inloggningsfel:", error);
        alert(`Inloggningen misslyckades: ${error.message}`);
      });
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (isRegistering) {
      return;
    }

    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const submitButton = registerForm.querySelector('button[type="submit"]');

    if (!name || !email || !password) {
      alert("Vänligen fyll i alla fält.");
      return;
    }

    isRegistering = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Skapar konto...';
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const firebaseUser = userCredential.user;

        const nameParts = name.split(' ').filter(part => part.length > 0);
        let avatarChar = '';
        if (nameParts.length >= 2) {
          avatarChar = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
        } else if (nameParts.length === 1) {
          avatarChar = nameParts[0][0].toUpperCase();
        }

        let avatarUrl = null;
        if (name.toLowerCase() === 'kollegabot') {
          avatarUrl = 'https://raw.githubusercontent.com/brunosj/do-it-chat-js/main/assets/bot-avatar.png';
        }

        const newUser = {
          id: firebaseUser.uid,
          name: name,
          email: email,
          avatarChar: avatarChar,
          colorClass: ['cyan', 'magenta', 'green', 'orange'][Math.floor(Math.random() * 4)],
          avatarUrl: avatarUrl,
          channels: [],
          mutedChannels: [],
          lastSeen: new Date().toISOString(),
          statusMessage: '',
          doNotDisturb: false,
          settings: {
            notifications: { enabled: true, sound: true }
          }
        };

        const botRef = db.collection('users').doc('user2');
        botRef.get().then(doc => {
          if (!doc.exists) {
            console.log("Kollegabot saknas, skapar den...");
            botRef.set({
              id: 'user2',
              name: 'Kollegabot',
              email: 'bot@doitchat.com',
              avatarChar: 'KB',
              colorClass: 'cyan',
              avatarUrl: 'https://raw.githubusercontent.com/brunosj/do-it-chat-js/main/assets/bot-avatar.png',
              channels: [],
              mutedChannels: [],
              lastSeen: new Date().toISOString(),
              statusMessage: 'Jag hjälper gärna till!',
              doNotDisturb: true,
              settings: {
                notifications: { enabled: false, sound: false }
              }
            });
          }
        });

        const userRef = db.collection('users').doc(firebaseUser.uid);
        return userRef.get().then((doc) => {
          if (doc.exists) {
            return userRef.set(newUser, { merge: true });
          }
          return userRef.set(newUser);
        });
      })
      .then(() => {
        window.location.href = 'index.html';
      })
      .catch((error) => {
        console.error("Registreringsfel:", error);
        alert(`Registreringen misslyckades: ${error.message}`);
      })
      .finally(() => {
        isRegistering = false;
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Registrera';
        }
      });
  });
});