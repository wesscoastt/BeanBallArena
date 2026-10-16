/* BEAN BALL ARENA - client/js/icons.js
 * The game's own icon set (inline SVG, drawn with currentColor) so no platform
 * emoji ever shows up: phones render emoji in their own art style.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};

  var S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var F = 'fill="currentColor" stroke="none"';
  var P = {
    play: '<path ' + F + ' d="M8 5.5v13l10.5-6.5z"/>',
    bot: '<rect ' + S + ' x="5" y="8" width="14" height="11" rx="3"/><path ' + S + ' d="M12 4.5V8M9.5 13h0M14.5 13h0M9.5 16.5h5"/><circle ' + F + ' cx="12" cy="4" r="1.4"/><circle ' + F + ' cx="9.5" cy="13" r="1.3"/><circle ' + F + ' cx="14.5" cy="13" r="1.3"/>',
    friends: '<circle ' + S + ' cx="9" cy="8.5" r="3.2"/><path ' + S + ' d="M3.5 19.5c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><circle ' + S + ' cx="16.5" cy="9" r="2.6"/><path ' + S + ' d="M16 14.4c2.4 0 4 1.5 4.6 4.6"/>',
    join: '<path ' + S + ' d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M4 12h11M11 8l4 4-4 4"/>',
    shirt: '<path ' + S + ' d="M8.5 4.5 4 7.5l2 3.5 2-1V19.5h8V10l2 1 2-3.5-4.5-3c-.6 1.6-2 2.5-3.5 2.5S9.1 6.1 8.5 4.5z"/>',
    gear: '<circle ' + S + ' cx="12" cy="12" r="3"/><path ' + S + ' d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    cap: '<path ' + S + ' d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path ' + S + ' d="M6.5 11.5v4c1.4 1.4 3.4 2 5.5 2s4.1-.6 5.5-2v-4M21.5 9.5V15"/>',
    ball: '<circle ' + S + ' cx="12" cy="12" r="8"/><path ' + S + ' d="M4 12h16M12 4v16M6.3 6.3c2.6 2.4 2.6 9 0 11.4M17.7 6.3c-2.6 2.4-2.6 9 0 11.4"/>',
    crown: '<path ' + F + ' d="M3.5 18.5 2.5 7l5.2 4.2L12 4.5l4.3 6.7L21.5 7l-1 11.5z"/>',
    check: '<path ' + S + ' d="M5 12.5 9.8 17 19 7"/>',
    left: '<path ' + F + ' d="M15.5 5.5v13L6.5 12z"/>',
    right: '<path ' + F + ' d="M8.5 5.5v13l9-6.5z"/>',
    star: '<path ' + F + ' d="m12 3.5 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z"/>',
    sparkle: '<path ' + F + ' d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/>',
    trophy: '<path ' + S + ' d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5c0 3 1.4 4.5 3.4 4.8M16.5 6h3c0 3-1.4 4.5-3.4 4.8M12 13.5v3.5M8.5 20.5h7M9.5 17h5l.5 3.5h-6z"/>',
    medal: '<path ' + S + ' d="M8 3.5 10.5 10M16 3.5 13.5 10"/><circle ' + S + ' cx="12" cy="15" r="5"/><path ' + F + ' d="m12 12.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>',
    lock: '<rect ' + S + ' x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path ' + S + ' d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    // touch buttons
    jump: '<path ' + S + ' d="M12 19.5V7M6.5 12 12 6.5l5.5 5.5M6 4h12"/>',
    grab: '<path ' + S + ' d="M7.5 12V6.8a1.5 1.5 0 0 1 3 0V11M10.5 10.5V5.3a1.5 1.5 0 0 1 3 0v5.2M13.5 10.5V6.3a1.5 1.5 0 0 1 3 0V13M16.5 10a1.5 1.5 0 0 1 3 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.6-2.2L4.6 14.3a1.5 1.5 0 0 1 2.2-2L8 13.5"/>',
    pass: '<path ' + S + ' d="M4 17c3.5-7.5 9-10 15.5-10M14.5 3.5 19.5 7l-3.6 4.6"/>',
    dive: '<path ' + S + ' d="M4.5 6.5 16 18M16 11.5V18H9.5"/>',
    shoot: '<circle ' + S + ' cx="12" cy="12" r="8"/><circle ' + S + ' cx="12" cy="12" r="3.6"/><circle ' + F + ' cx="12" cy="12" r="1.2"/>',
    ballcam: '<path ' + S + ' d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle ' + S + ' cx="12" cy="12" r="3"/>',
    dunk: '<path ' + S + ' d="M4.5 9h15M6 9l1.6 6.5h8.8L18 9M9 15.5l-1 4M15 15.5l1 4M12 15.5v4"/><circle ' + F + ' cx="12" cy="4.7" r="2.4"/>',
    ability: '<path ' + F + ' d="M13.5 2.5 5.5 13.2h5.3L9.5 21.5l9-11.6h-5.6z"/>'
  };

  function svg(name, cls) {
    var body = P[name] || P.star;
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  }

  // static markup: <span data-icon="gear"></span> becomes the icon
  function hydrate(rootEl) {
    var els = (rootEl || root.document).querySelectorAll('[data-icon]');
    for (var i = 0; i < els.length; i++) { if (!els[i].firstChild) els[i].innerHTML = svg(els[i].getAttribute('data-icon')); }
  }

  BBA.Icons = { svg: svg, hydrate: hydrate, names: Object.keys(P) };
  if (root.document && root.document.readyState !== 'loading') hydrate();
  else if (root.document) root.document.addEventListener('DOMContentLoaded', function () { hydrate(); });
})(this);
