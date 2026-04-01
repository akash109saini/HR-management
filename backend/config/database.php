<?php

return [
    'default' => 'mongodb',
    'connections' => [
        'mongodb' => [
            'driver' => 'mongodb',
            'dsn' => env('MONGO_URL', 'mongodb://localhost:27017'),
            'database' => env('DB_DATABASE', 'test_database'),
        ],
    ],
    'migrations' => [
        'table' => 'migrations',
        'update_date_on_migration' => true,
    ],
];
