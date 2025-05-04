<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Webmozart\Assert\Assert;
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
        $result = $this->wrappedNormalizer->normalize($example);
        Assert::isArray($result, 'Normalizer must return an array');
        return $result;
    }

    public function toJson(Example $example, bool $pretty = true): string
    {

        return json_encode($this->normalize($example), $pretty ? JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR : JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    public function toQueryParam(Example $example): string
    {
        $zipped = gzdeflate($this->toJson($example));
        Assert::string($zipped, 'Failed to compress example');
        return urlencode('data:application/dcb+json;base64,' . base64_encode($zipped));
    }
}
