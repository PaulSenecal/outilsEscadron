// Jeu de questions commun au quiz en ligne et à la partie en direct.
// Source principale : la base partagée Firebase (nœud `quiz`, lecture publique,
// lue par l'API REST pour ne pas charger tout le SDK). Si la base est vide ou
// injoignable, repli sur le fichier publié data/quiz.json.
(function () {
  var BASE = 'https://quizzer-90b2a-default-rtdb.europe-west1.firebasedatabase.app/quiz.json';
  var FICHIER = 'data/quiz.json';

  // Firebase renvoie parfois les tableaux sous forme d'objets {0:…, 1:…}.
  function liste(v) {
    return Array.isArray(v) ? v.filter(function (x) { return x != null; }) : (v ? Object.values(v) : []);
  }
  function parOrdre(a, b) { return (a.ordre || 0) - (b.ordre || 0) || String(a.id).localeCompare(String(b.id)); }

  // Convertit le nœud `quiz` au format { categories, questions } attendu par les pages.
  function depuisBase(v) {
    if (!v || !v.questions) return null;
    var questions = Object.keys(v.questions).map(function (id) {
      var q = v.questions[id] || {};
      return {
        id: id, category: q.category, question: q.question, image: q.image || null,
        multiCorrect: !!q.multiCorrect, ordre: q.ordre || 0,
        answers: liste(q.answers).map(function (a) { return { text: a.text || '', correct: !!a.correct }; })
      };
    }).sort(parOrdre);
    if (!questions.length) return null;
    var categories = v.categories ? Object.keys(v.categories).map(function (id) {
      var c = v.categories[id];
      return { id: id, label: c.label, color: c.color, ordre: c.ordre || 0 };
    }).sort(parOrdre) : null;
    var r = { questions: questions, source: 'base' };
    if (categories && categories.length) r.categories = categories;
    return r;
  }

  window.chargerBanque = async function () {
    try {
      var ctl = new AbortController();
      var minuteur = setTimeout(function () { ctl.abort(); }, 6000);
      var r = await fetch(BASE, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(minuteur);
      if (r.ok) {
        var d = depuisBase(await r.json());
        if (d) return d;
      }
    } catch (e) { /* base injoignable : on passe au fichier */ }
    var f = await fetch(FICHIER + '?v=' + Date.now(), { cache: 'no-store' });
    if (!f.ok) throw new Error('HTTP ' + f.status);
    return f.json();
  };
})();
