<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

final readonly class Meta
{
    public function __construct(
        public string $version,
        public string|null $id = null,
        public string|null $extends = null,
    ) {}

    public function merge(self $other): self
    {
        return new self(
            $other->version ?? '1.0',
            $other->id ?? null,
        );
    }
}
