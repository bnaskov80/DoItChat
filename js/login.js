document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  const showRegisterBtn = document.getElementById('show-register-btn');
  const showLoginBtn = document.getElementById('show-login-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

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
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    if (!name || !email || !password) {
      alert("Vänligen fyll i alla fält.");
      return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Användaren har skapats i Firebase Auth
        const firebaseUser = userCredential.user;

        // Skapa initialer för avataren
        const nameParts = name.split(' ').filter(part => part.length > 0);
        let avatarChar = '';
        if (nameParts.length >= 2) {
          avatarChar = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
        } else if (nameParts.length === 1) {
          avatarChar = nameParts[0][0].toUpperCase();
        }

        // NYTT: Ge Kollegabot en unik avatar
        let avatarUrl = null;
        if (name.toLowerCase() === 'kollegabot') {
          avatarUrl = 'https://raw.githubusercontent.com/brunosj/do-it-chat-js/main/assets/bot-avatar.png';
        }
        // Skapa ett användarobjekt för att spara i Firestore
        const newUser = {
          id: firebaseUser.uid, // Använd Firebase UID som ID
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

        // NYTT: Kontrollera om Kollegabot finns, och skapa den om den saknas.
        // Detta är en "seed"-funktion som bara behöver köras en gång.
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

        // Spara det nya användarobjektet i 'users'-kollektionen i Firestore
        return db.collection('users').doc(firebaseUser.uid).set(newUser);
      })
      .then(() => {
        // Allt är klart, omdirigera till chatten
        window.location.href = 'index.html';
      })
      .catch((error) => {
        // Hantera fel, t.ex. om e-posten redan används
        console.error("Registreringsfel:", error);
        alert(`Registreringen misslyckades: ${error.message}`);
      });
  });
});