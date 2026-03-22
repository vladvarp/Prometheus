<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Функция для тестирования подключения
function testConnection($url, $timeout = 10) {
    $start_time = microtime(true);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_FAILONERROR, true);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $total_time = microtime(true) - $start_time;
    $error = curl_error($ch);
    
    curl_close($ch);
    
    // Если есть ошибка cURL
    if ($error) {
        return [
            'status' => 0,
            'time' => round($total_time * 1000),
            'success' => false,
            'error' => $error
        ];
    }
    
    return [
        'status' => $http_code,
        'time' => round($total_time * 1000),
        'success' => $http_code >= 200 && $http_code < 400
    ];
}

// Обработка запросов
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data) {
        echo json_encode(['error' => 'Invalid JSON data']);
        exit;
    }
    
    $service = $data['service'] ?? '';
    $action = $data['action'] ?? '';
    
    switch ($service) {
        case 'youtube':
            if ($action === 'connect') {
                $result = testConnection('https://www.youtube.com/');
                echo json_encode($result);
            }
            break;
            
        case 'telegram':
            if ($action === 'connect') {
                $result = testConnection('https://t.me/');
                echo json_encode($result);
            }
            break;
            
        default:
            echo json_encode(['error' => 'Unknown service']);
            break;
    }
} else {
    echo json_encode([
        'message' => 'Connection test API for YouTube and Telegram',
        'services' => ['youtube', 'telegram'],
        'actions' => ['connect']
    ]);
}
?>