<?php
/**
 * Radio Crash Discogs proxy.
 * The Discogs token is read from RC_DISCOGS_TOKEN and is never exposed to the browser.
 */

add_action('rest_api_init', function () {
    register_rest_route('rc/v1', '/discogs', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $request) {
            $artist = sanitize_text_field((string) $request->get_param('artist'));
            $title  = sanitize_text_field((string) $request->get_param('title'));
            $type   = sanitize_text_field((string) $request->get_param('type')) ?: 'release';

            if ($artist === '' || $title === '') {
                return new WP_REST_Response(['ok' => false, 'error' => 'missing_query'], 400);
            }

            $token = getenv('RC_DISCOGS_TOKEN') ?: '';
            if ($token === '') {
                return new WP_REST_Response(['ok' => false, 'error' => 'discogs_token_not_configured'], 503);
            }

            $query = trim($artist . ' ' . $title);
            $url = add_query_arg([
                'q' => $query,
                'type' => $type,
                'per_page' => 20,
            ], 'https://api.discogs.com/database/search');

            $response = wp_remote_get($url, [
                'timeout' => 10,
                'headers' => [
                    'Authorization' => 'Discogs token=' . $token,
                    'User-Agent' => 'RadioCrash/1.0 +https://www.radiocrash.net',
                    'Accept' => 'application/json',
                ],
            ]);

            if (is_wp_error($response)) {
                return new WP_REST_Response(['ok' => false, 'error' => 'discogs_unavailable'], 502);
            }

            $status = (int) wp_remote_retrieve_response_code($response);
            $body = json_decode(wp_remote_retrieve_body($response), true);

            if ($status < 200 || $status >= 300 || !is_array($body)) {
                return new WP_REST_Response(['ok' => false, 'error' => 'discogs_error'], 502);
            }

            return new WP_REST_Response([
                'ok' => true,
                'raw' => $body,
            ], 200);
        },
    ]);
});
