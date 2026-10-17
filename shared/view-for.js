// What one phone is allowed to see of everything the DM app publishes (pub, from publishToPlayers()):
// handouts, wiki pages and homebrew sent to everyone or to this player, only this player's own character card
// and roll feed. Used by the LAN server (server.js) and by online tables (renderer/js/online.js), so both
// send exactly the same thing. `client` is { player: name or null, display: true for the TV window }.
(function (root) {
  function viewFor(pub, client) {
    const me = (client.player || '').toLowerCase();
    const forMe = (to) => client.display ? to === 'all' : (to === 'all' || (Array.isArray(to) && to.some(n => n.toLowerCase() === me)));
    const handouts = (pub.handouts || []).filter(h => forMe(h.to));
    const wiki = (pub.wiki || []).filter(w => forMe(w.to));
    const card = (pub.partyCards || []).find(c => c.name.toLowerCase() === me) || null;
    const feed = client.display ? [] : (pub.feed || []).filter(f => (f.player || '').toLowerCase() === me);
    const hb = pub.homebrew || {};
    const homebrew = client.display ? null : { spells: (hb.spells || []).filter(x => forMe(x.to)), items: (hb.items || []).filter(x => forMe(x.to)) };
    return { initiative: pub.initiative, handouts, wiki, map: pub.map, calendar: pub.calendar, party: pub.party || [], card, feed, homebrew, you: client.player || null };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { viewFor };
  else root.viewFor = viewFor;
})(this);
