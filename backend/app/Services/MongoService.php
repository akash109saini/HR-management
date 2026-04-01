<?php

namespace App\Services;

use MongoDB\Client;
use MongoDB\Collection;
use MongoDB\BSON\ObjectId;

class MongoService
{
    private static ?Client $client = null;
    private static ?string $dbName = null;

    public static function getClient(): Client
    {
        if (!self::$client) {
            self::$client = new Client(env('MONGO_URL', 'mongodb://localhost:27017'));
            self::$dbName = env('DB_DATABASE', 'test_database');
        }
        return self::$client;
    }

    public static function collection(string $name): Collection
    {
        return self::getClient()->selectDatabase(self::$dbName ?? 'test_database')->selectCollection($name);
    }

    public static function find(string $collectionName, array $filter = [], array $options = []): array
    {
        $defaultOptions = ['projection' => ['_id' => 0]];
        $opts = array_merge($defaultOptions, $options);
        $cursor = self::collection($collectionName)->find($filter, $opts);
        return array_values(iterator_to_array($cursor));
    }

    public static function findOne(string $collectionName, array $filter, array $options = []): ?array
    {
        $doc = self::collection($collectionName)->findOne($filter, $options);
        return $doc ? self::docToArray($doc) : null;
    }

    public static function findOneNoId(string $collectionName, array $filter): ?array
    {
        return self::findOne($collectionName, $filter, ['projection' => ['_id' => 0]]);
    }

    public static function insertOne(string $collectionName, array $doc): void
    {
        self::collection($collectionName)->insertOne($doc);
    }

    public static function updateOne(string $collectionName, array $filter, array $update): int
    {
        $result = self::collection($collectionName)->updateOne($filter, ['$set' => $update]);
        return $result->getModifiedCount();
    }

    public static function deleteOne(string $collectionName, array $filter): int
    {
        $result = self::collection($collectionName)->deleteOne($filter);
        return $result->getDeletedCount();
    }

    public static function deleteMany(string $collectionName, array $filter): int
    {
        $result = self::collection($collectionName)->deleteMany($filter);
        return $result->getDeletedCount();
    }

    public static function count(string $collectionName, array $filter = []): int
    {
        return self::collection($collectionName)->countDocuments($filter);
    }

    public static function increment(string $collectionName, array $filter, string $field, int $amount = 1): void
    {
        self::collection($collectionName)->updateOne($filter, ['$inc' => [$field => $amount]]);
    }

    public static function objectId(string $id): ObjectId
    {
        return new ObjectId($id);
    }

    public static function docToArray($doc): array
    {
        if ($doc instanceof \MongoDB\Model\BSONDocument) {
            $arr = (array) $doc->jsonSerialize();
        } elseif ($doc instanceof \MongoDB\Model\BSONArray) {
            $arr = (array) $doc->jsonSerialize();
        } else {
            $arr = (array) $doc;
        }

        foreach ($arr as $key => $value) {
            if ($value instanceof \MongoDB\BSON\ObjectId) {
                $arr[$key] = (string) $value;
            } elseif ($value instanceof \MongoDB\Model\BSONDocument || $value instanceof \MongoDB\Model\BSONArray) {
                $arr[$key] = self::docToArray($value);
            }
        }
        return $arr;
    }
}
