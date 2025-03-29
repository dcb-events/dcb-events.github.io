<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Hoa\Protocol\Node\Node;
use Wwwision\Types\Normalizer\Normalizer as WrappedNormalizer;

final readonly class Normalizer
{
    private WrappedNormalizer $wrappedNormalizer;

    public function __construct()
    {
        $this->wrappedNormalizer = new WrappedNormalizer();
    }


    /**
     * @return array<mixed>
     */
    public function normalize(Example $example): array
    {
        return $this->wrappedNormalizer->normalize($example);
    }

    public function toJson(Example $example, bool $pretty = true): string
    {

        return json_encode($this->normalize($example), $pretty ? JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR : JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    public function toQueryParam(Example $example): string
    {
        return urlencode('data:application/dcb+json;base64,' . base64_encode(gzdeflate($this->toJson($example))));
    }
}
