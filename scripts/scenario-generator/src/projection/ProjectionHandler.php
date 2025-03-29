<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\projection;

use Wwwision\Types\Attributes\StringBased;

use function Wwwision\Types\instantiate;

#[StringBased]
final readonly class ProjectionHandler
{
    private function __construct(
        public string $value,
    ) {}

    public static function fromString(string $value): self
    {
        return instantiate(self::class, $value);
    }
}
