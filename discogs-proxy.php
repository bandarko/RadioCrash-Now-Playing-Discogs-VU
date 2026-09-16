add_action('rest_api_init', function () {

  // TEST ruta (da odmah znamo radi li)
  register_rest_route('rc/v1', '/ping', [
    'methods'  => 'GET',
    'callback' => function () { return [ 'ok' => true, 'ts' => time() ]; },
    'permission_callback' => '__return_true',
  ]);

  // Discogs proxy ruta
  register_rest_route('rc/v1', '/discogs', [
    'methods'  => 'GET',
    'callback' => 'rc_discogs_proxy',
    'permission_callback' => '__return_true',
  ]);
});

function rc_discogs_proxy(\WP_REST_Request $req) {
  $artist = sanitize_text_field($req->get_param('artist'));
  $title  = sanitize_text_field($req->get_param('title'));
  $type   = sanitize_text_field($req->get_param('type'));

  if (!$artist || !$title) {
    return new \WP_REST_Response([ 'ok' => false, 'error' => 'missing_params' ], 400);
  }

  // ✅ OVDJE STAVI TOKEN
  $token = getenv('RC_DISCOGS_TOKEN') ?: '';

  $type = ($type === 'master') ? 'master' : 'release';

  // Cache 30 min (da Discogs ne vidi spam)
  $cache_key = 'rc_discogs_' . md5(mb_strtolower($artist . '|' . $title . '|' . $type, 'UTF-8'));
  $cached = get_transient($cache_key);
  if ($cached !== false) {
    return new \WP_REST_Response($cached, 200);
  }

  $params = [
    'per_page' => 20,
    'artist'   => $artist,
    'track'    => $title,
    'type'     => $type,
  ];

  $url = 'https://api.discogs.com/database/search?' . http_build_query($params);

  $resp = wp_remote_get($url, [
    'timeout' => 6,
    'headers' => [
      'Authorization' => 'Discogs token=' . $token,
      'User-Agent'    => 'RadioCrashNowPlaying/1.0 (+https://www.radiocrash.net; contact: admin@radiocrash.net)',
      'Accept'        => 'application/json',
    ],
  ]);

  if (is_wp_error($resp)) {
    $out = [ 'ok' => false, 'error' => $resp->get_error_message() ];
    set_transient($cache_key, $out, 60);
    return new \WP_REST_Response($out, 502);
  }

  $code = wp_remote_retrieve_response_code($resp);
  $body = wp_remote_retrieve_body($resp);
  $json = json_decode($body, true);

  $out = [
    'ok'   => ($code >= 200 && $code < 300 && is_array($json)),
    'code' => $code,
    'raw'  => $json,
  ];

  set_transient($cache_key, $out, $out['ok'] ? 30 * MINUTE_IN_SECONDS : 120);

  return new \WP_REST_Response($out, 200);
}