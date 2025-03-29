<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

use Closure;
use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<ConstraintCheck>
 */
#[ListBased(itemClassName: ConstraintCheck::class)]
final readonly class ConstraintChecks implements IteratorAggregate
{
    /**
     * @param array<ConstraintCheck> $constraintChecks
     */
    private function __construct(
        private array $constraintChecks,
    ) {
    }

    /**
     * @param array<ConstraintCheck> $constraintChecks
     */
    public static function fromArray(array $constraintChecks): self
    {
        return instantiate(self::class, $constraintChecks);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->constraintChecks);
    }

    /**
     * @template T
     * @param Closure(ConstraintCheck): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->constraintChecks);
    }
}
