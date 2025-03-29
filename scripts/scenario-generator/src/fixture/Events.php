<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\fixture;

use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<Event>
 */
#[ListBased(itemClassName: Event::class)]
final readonly class Events implements IteratorAggregate
{
    /**
     * @param array<Event> $events
     */
    private function __construct(
        private array $events,
    ) {
    }

    /**
     * @param array<Event> $events
     */
    public static function fromArray(array $events): self
    {
        return instantiate(self::class, $events);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->events);
    }
}
