<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\testCase;

use Webmozart\Assert\Assert;

final readonly class Command
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        public string $type,
        public array $data,
    ) {
        Assert::isMap($data, 'Data keys must be strings');
    }
}
