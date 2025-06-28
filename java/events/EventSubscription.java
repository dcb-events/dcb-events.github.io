package events;

public interface EventSubscription {

    void cancel();

    void request(int numberOfEvents);

}
