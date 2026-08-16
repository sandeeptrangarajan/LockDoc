/* =========================================================
   LockDoc — watermark.js
   Builds a tiled, diagonal, non-removable watermark overlay
   stamped with viewer identity + timestamp, used in viewer.html
   to discourage redistribution of view-only documents.

   Watermark includes:
   - Requester name
   - Organization name
   - Purpose of request
   - Current date/time
   - Session ID
   ========================================================= */

window.LD = window.LD || {};

LD.watermark = {};

/* ---------------------------------------------------------
   Build watermark HTML string with all identity info
   --------------------------------------------------------- */
LD.watermark.build = function(opts){
  // Combine all parts into a single label
  var parts = [
    'LockDoc',
    opts.viewerName || 'Viewer',
    opts.organization || '',
    opts.purpose ? 'Purpose: ' + opts.purpose : '',
    new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    opts.sessionId ? 'ID: ' + opts.sessionId.slice(-8).toUpperCase() : ''
  ];

  var label = parts.filter(Boolean).join('  •  ');
  var rows = [];
  var rowCount = 8;
  for(var i = 0; i < rowCount; i++){
    var repeated = new Array(5).fill(label).map(function(t){
      return '<span>' + LD.watermark.escape(t) + '</span>';
    }).join('');
    rows.push('<div class="wm-row" style="top:' + (i * 14 - 12) + '%;">' + repeated + '</div>');
  }
  return '<div class="watermark-layer" aria-hidden="true">' + rows.join('') + '</div>';
};

/* ---------------------------------------------------------
   Escape HTML entities for safety
   --------------------------------------------------------- */
LD.watermark.escape = function(str){
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/* ---------------------------------------------------------
   Stamp watermark onto a container element
   opts: { viewerName, organization, purpose, sessionId }
   --------------------------------------------------------- */
LD.watermark.stamp = function(containerEl, opts){
  containerEl.insertAdjacentHTML('beforeend', LD.watermark.build(opts || {}));
};

