<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Countable;
use InvalidArgumentException;
use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<SourceImplementation>
 */
#[ListBased(itemClassName: SourceImplementation::class)]
final readonly class SourceImplementations implements IteratorAggregate, Countable
{
    /**
     * @param array<SourceImplementation> $implementations
     */
    private function __construct(
        private array $implementations,
    ) {
        $ids = array_map(static fn(SourceImplementation $implementation): string => $implementation->id, $implementations);
        if (count($ids) !== count(array_unique($ids))) {
            throw new InvalidArgumentException('Source implementation ids must be unique');
        }
    }

    /**
     * @param array<SourceImplementation> $implementations
     */
    public static function fromArray(array $implementations): self
    {
        return instantiate(self::class, $implementations);
    }

    public static function none(): self
    {
        return self::fromArray([]);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->implementations);
    }

    public function count(): int
    {
        return count($this->implementations);
    }

    public function merge(self $other): self
    {
        $implementations = array_values($this->implementations);

        foreach ($other->implementations as $otherImplementation) {
            foreach ($implementations as $index => $implementation) {
                if ($implementation->id === $otherImplementation->id) {
                    $implementations[$index] = $implementation->merge($otherImplementation);
                    continue 2;
                }
            }
            $implementations[] = $otherImplementation;
        }

        return self::fromArray($implementations);
    }
}
