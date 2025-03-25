package events;

public interface Checkpoint {

    SequencePosition subscriptionPosition();

    SequencePosition head();

}
