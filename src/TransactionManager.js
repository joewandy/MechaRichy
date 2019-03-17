class TransactionManager {
    static broadcastTransaction($, tx) {
        if ($.clientType !== DevUi.ClientType.NANO) {
            return $.mempool.pushTransaction(tx);
        } else {
            return Utils.awaitConsensus($).then(() => $.consensus.relayTransaction(tx));
        }
    }

    static awaitConsensus($) {
        if ($.consensus.established) return Promise.resolve();
        return new Promise(resolve => {
            const onConsensus = () => {
                $.consensus.off('established', onConsensus);
                resolve();
            };
            $.consensus.on('established', onConsensus);
        });
    }

    static lunasToCoins(value) {
        return Nimiq.Policy.lunasToCoins(value).toFixed(Math.log10(Nimiq.Policy.LUNAS_PER_COIN));
    }

    static readAddress(input) {
        try {
            const address =  Nimiq.Address.fromUserFriendlyAddress(input.value);
            input.classList.remove('error');
            return address;
        } catch (e) {
            input.classList.add('error');
            return null;
        }
    }
}
