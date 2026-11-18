// Escala del gimnasio (francesa, pero el 5 no se divide en a/b/c), de más fácil a más difícil.
// Tiene que coincidir con la lista de apps-script/Code.gs.
(function (root) {
  const GRADOS = [
    '4', '4+', '5', '5+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+',
    '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a',
  ];
  if (typeof module !== 'undefined') module.exports = GRADOS;
  else root.GRADOS = GRADOS;
})(this);
