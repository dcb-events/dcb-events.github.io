<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\fixture;

use Webmozart\Assert\Assert;

final readonly class Event
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        public string $type,
        public array $data,
        public array $metadata = [],
    ) {
        Assert::isMap($data, 'Data keys must be strings');
        Assert::isMap($metadata, 'Metadata keys must be strings');
    }

}
