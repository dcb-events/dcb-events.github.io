<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

final readonly class Meta
{
    public function __construct(
        public string $version,
        public string|null $id = null,
        public string|null $extends = null,
        public SourceImplementations|null $implementations = null,
    ) {}

    public function merge(self $other): self
    {
        return new self(
            version: $other->version,
            id: $other->id,
            implementations: $other->implementations === null
                ? $this->implementations
                : ($this->implementations?->merge($other->implementations) ?? $other->implementations),
        );
    }
}
